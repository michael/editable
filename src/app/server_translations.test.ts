import { Session, type Document } from 'svedit';
import * as svedit from 'svedit';
import { document_schema, MEDIA_DEFAULTS } from './document_schema.js';
import { delete_media } from './media.js';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en,de,fr',
	ORIGIN: 'https://example.com',
	VERCEL: undefined
}));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { sqlite_backend } = await import('#lib/server/backends/sqlite_backend.js');
	const sqlite = new DatabaseSync(':memory:');
	const asset_dir = mkdtempSync(`${tmpdir()}/editable-assets-`);
	return {
		sqlite,
		backend: sqlite_backend({ db: sqlite, asset_dir }),
		asset_exists: vi.fn(async () => true)
	};
});

import { default_site } from './server_site.js';
import * as services from './services.js';
const { sqlite, asset_exists } = services as unknown as typeof services & { sqlite: DatabaseSync };
import migration from '#app/migrations/20260923T180000000Z_editable_translations.js';
import {
	default_page_document,
	default_banner_document,
	default_nav_document,
	default_footer_document
} from './default_site.js';
import {
	cleanup_translations,
	save_translated_document,
	translated_document
} from './server_translations.js';
import { property_payload, translation_properties, type TranslationMap } from './translations.js';
import { replace_translation } from './test_helpers/translations.js';
import { referenced_assets } from '../../scripts/asset-references.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// With no site set by a host, the code under test uses the deployment's own.
const { languages } = default_site;

afterAll(() => (sqlite as DatabaseSync).close());

beforeEach(() => {
	languages.splice(0, languages.length, 'en', 'de', 'fr');
	sqlite.exec(
		'DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS asset_refs; DROP TABLE IF EXISTS translations'
	);
	vi.mocked(asset_exists).mockResolvedValue(true);
	sqlite.exec(
		'CREATE TABLE documents (document_id TEXT PRIMARY KEY, data TEXT); CREATE TABLE asset_refs (asset_id TEXT, document_id TEXT, PRIMARY KEY (asset_id, document_id))'
	);
	migration.up({ db: sqlite } as SqliteStorage);
	for (const doc of [
		default_page_document,
		default_banner_document,
		default_nav_document,
		default_footer_document
	]) {
		sqlite.prepare('INSERT INTO documents VALUES (?, ?)').run(doc.document_id, JSON.stringify(doc));
	}
});

function stored_map(document_id: string, language = 'de'): TranslationMap {
	const row = sqlite
		.prepare('SELECT value FROM translations WHERE document_id = ? AND language = ?')
		.get(document_id, language) as { value: string } | undefined;
	return row ? JSON.parse(row.value) : {};
}

function store_translation(
	document_id: string,
	language: string,
	node_id: string,
	property_id: string,
	value: string,
	updated_at = '2026-10-02T00:00:00.000Z'
) {
	const map = stored_map(document_id, language);
	let payload;
	try {
		payload = JSON.parse(value);
	} catch {
		payload = value;
	}
	(map[node_id] ??= {})[property_id] = payload;
	sqlite
		.prepare('INSERT OR REPLACE INTO translations VALUES (?, ?, ?, ?)')
		.run(document_id, language, JSON.stringify(map), updated_at);
}

it('saves sparse page/shared translations, protects originals, rejects stale and structural saves, and resets equal text', async () => {
	const originals = sqlite.prepare('SELECT * FROM documents ORDER BY document_id').all();
	const id = default_page_document.document_id;
	const loaded = await translated_document(id, 'de');
	const input = {
		...loaded.document,
		language: 'de',
		translation_revision: loaded.translation_revision
	};
	// Saving fallback text alone must not create any rows.
	await save_translated_document(input);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	input.nodes[id].title.content = 'Deutscher Titel';
	const footer_property = translation_properties(default_footer_document).find(
		({ node_id, property_id }) =>
			default_footer_document.nodes[node_id][property_id]?.content !== undefined
	)!;
	input.nodes[footer_property.node_id][footer_property.property_id].content = 'Deutsche Fußzeile';
	await save_translated_document(input);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(2);
	expect(stored_map(id)[id].title).toEqual({
		content: 'Deutscher Titel',
		marks: [],
		annotations: [],
		nodes: {}
	});
	expect(
		sqlite
			.prepare('SELECT * FROM translations WHERE document_id = ?')
			.all(default_footer_document.document_id)
	).toHaveLength(1);
	expect(sqlite.prepare('SELECT * FROM documents ORDER BY document_id').all()).toEqual(originals);
	await expect(save_translated_document(input)).rejects.toThrow();
	const translated = await translated_document(id, 'de');
	expect(translated.document.nodes[id].title.content).toBe('Deutscher Titel');
	const original = await translated_document(id, 'en');
	const invalid = structuredClone(translated.document);
	invalid.nodes[id].body.nodes = [];
	await expect(
		save_translated_document({
			...invalid,
			language: 'de',
			translation_revision: translated.translation_revision
		})
	).rejects.toThrow();
	await save_translated_document({
		...original.document,
		language: 'de',
		translation_revision: translated.translation_revision
	});
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
});

const asset_a = `${'a'.repeat(64)}.webp`;
const asset_b = `${'b'.repeat(64)}.mp4`;

async function load_input(language = 'de') {
	const loaded = await translated_document(default_page_document.document_id, language);
	return { ...loaded.document, language, translation_revision: loaded.translation_revision };
}

function replace_image(
	input: Awaited<ReturnType<typeof load_input>>,
	owner_id: string,
	property: string,
	src: string,
	type = 'image'
) {
	const original = input.nodes[input.nodes[owner_id][property]];
	const id = 'translated_media';
	replace_translation(input, owner_id, property, {
		node_id: id,
		nodes: {
			[id]: {
				...original,
				id,
				type,
				src,
				mime_type: type === 'image' ? 'image/webp' : 'video/mp4',
				alt: 'Übersetztes Medium',
				width: 640,
				height: 480
			}
		}
	});
}

it('stores media overrides, loads original fallback, and retains assets across languages and original saves', async () => {
	const id = default_page_document.document_id;
	const original = (await translated_document(id, 'en')).document;
	const input = await load_input();
	replace_image(input, id, 'image', asset_a);
	await save_translated_document(input);
	const payload = stored_map(id)[id].image;
	if (!('node_id' in payload)) throw new Error('Expected media override');
	expect(payload.node_id).toBe('translated_media');
	expect(payload.nodes.translated_media.src).toBe(asset_a);
	const loaded = await load_input();
	expect(loaded.nodes[loaded.nodes[id].image].alt).toBe('Übersetztes Medium');
	expect((await translated_document(id, 'en')).document).toEqual(original);
	const fallback = (await translated_document(id, 'fr')).document;
	expect(fallback.nodes[fallback.nodes[id].image]).toEqual(
		original.nodes[original.nodes[id].image]
	);
	const french = await load_input('fr');
	replace_image(french, id, 'image', asset_a);
	await save_translated_document(french);
	// Cleaning up after an original save must retain translation-only assets.
	await cleanup_translations(id);
	expect(referenced_assets(sqlite)).toContain(asset_a);
	for (const language of ['de', 'fr']) {
		const reset = await load_input(language);
		replace_translation(reset, id, 'image', property_payload(original, id, 'image'));
		await save_translated_document(reset);
		expect([...referenced_assets(sqlite)].includes(asset_a)).toBe(language === 'de');
	}
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
});

it.each([false, true])(
	'cleans deleted original nodes across stored languages with multilingual disabled=%s',
	async (disabled) => {
		const input = await load_input();
		const media_property = translation_properties(default_nav_document).find(
			({ node_id, property_id }) =>
				property_id === 'media' && default_nav_document.nodes[node_id].type === 'nav_media'
		)!;
		expect(media_property).toBeDefined();
		const { node_id, property_id } = media_property;
		replace_image(input, node_id, property_id, asset_b, 'video');
		await save_translated_document(input);
		const loaded = await load_input();
		expect(loaded.nodes[loaded.nodes[node_id][property_id]].type).toBe('video');
		expect(referenced_assets(sqlite)).toContain(asset_b);
		const nav: Document = structuredClone(default_nav_document);
		const spanish_map = stored_map(nav.document_id);
		sqlite
			.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)')
			.run(nav.document_id, 'es', JSON.stringify(spanish_map), 'now');
		if (disabled) languages.splice(0);
		delete nav.nodes[node_id];
		sqlite
			.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
			.run(JSON.stringify(nav), nav.document_id);
		await cleanup_translations(nav.document_id);
		expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
		expect(referenced_assets(sqlite)).not.toContain(asset_b);
	}
);

it('rejects unuploaded media, stale saves, extraneous nodes and structural changes without changing references', async () => {
	const id = default_page_document.document_id;
	const input = await load_input();
	replace_image(input, id, 'image', 'blob:pending');
	await expect(save_translated_document(input)).rejects.toThrow();
	input.nodes[input.nodes[id].image].src = asset_a;
	vi.mocked(asset_exists).mockResolvedValue(false);
	await expect(save_translated_document(input)).rejects.toThrow();
	vi.mocked(asset_exists).mockResolvedValue(true);
	const orphan = structuredClone(input);
	orphan.nodes.unrelated = { ...input.nodes[input.nodes[id].image], id: 'unrelated' };
	await expect(save_translated_document(orphan)).rejects.toThrow();
	const invalid = structuredClone(input);
	invalid.nodes[id].body.nodes = [];
	await expect(save_translated_document(invalid)).rejects.toThrow();
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
	await save_translated_document(input);
	await expect(save_translated_document(input)).rejects.toThrow();
	expect(referenced_assets(sqlite)).toContain(asset_a);
	// Deleting the owning document releases translations and their assets too.
	sqlite.prepare('DELETE FROM documents WHERE document_id = ?').run(id);
	await cleanup_translations(id);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
});

it('keeps a translated asset alive while a regular document still references it', async () => {
	const id = default_page_document.document_id;
	const input = await load_input();
	replace_image(input, id, 'image', asset_a);
	await save_translated_document(input);
	const original = structuredClone(default_page_document);
	original.nodes[original.nodes[id].image].src = asset_a;
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(original), id);
	const reset = await load_input();
	replace_translation(reset, id, 'image', property_payload(original, id, 'image'));
	await save_translated_document(reset);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(referenced_assets(sqlite)).toContain(asset_a);
	original.nodes[original.nodes[id].image].src = '';
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(original), id);
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
});

it('removes incompatible media overrides and their asset references during original cleanup', async () => {
	const id = default_page_document.document_id;
	const media_id = default_page_document.nodes[id].image;
	const node = {
		...default_page_document.nodes[media_id],
		id: 'invalid_video',
		type: 'video',
		src: asset_b
	};
	store_translation(
		id,
		'de',
		id,
		'image',
		JSON.stringify({ node_id: node.id, nodes: { [node.id]: node } }),
		new Date().toISOString()
	);
	expect(referenced_assets(sqlite)).toContain(asset_b);
	await cleanup_translations(id);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(referenced_assets(sqlite)).not.toContain(asset_b);
});

it('persists deleted translated media as an empty override and releases its asset reference', async () => {
	const id = default_page_document.document_id;
	const source = structuredClone(default_page_document);
	source.nodes[source.nodes[id].image].src = `${'c'.repeat(64)}.webp`;
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(source), id);
	const original = (await translated_document(id, 'en')).document;
	const input = await load_input();
	replace_image(input, id, 'image', asset_a);
	await save_translated_document(input);
	const loaded = await load_input();
	const session = new Session(document_schema, loaded, {
		handle_property_deletion: (tr, path) => delete_media(tr, path)
	});
	session.apply(
		session.tr.set_selection({ type: 'property', path: [id, 'image'] }).delete_selection()
	);
	await save_translated_document({ ...loaded, ...session.to_json() });
	const result = await load_input();
	expect(result.nodes[result.nodes[id].image]).toMatchObject(MEDIA_DEFAULTS);
	expect(stored_map(id)[id].image).toBeDefined();
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
	expect((await translated_document(id, 'en')).document).toEqual(original);
	const french = (await translated_document(id, 'fr')).document;
	expect(french.nodes[french.nodes[id].image]).toEqual(original.nodes[original.nodes[id].image]);
});

it('keeps server references in sync with backup scanning across documents and disabled languages', async () => {
	const page_id = default_page_document.document_id;
	const nav_id = default_nav_document.document_id;
	const input = await load_input();
	replace_image(input, page_id, 'image', asset_a);
	await save_translated_document(input);
	// A saved language no longer present in LANGUAGES must still retain its assets.
	sqlite.prepare('UPDATE translations SET language = ?').run('it');
	const nav: Document = structuredClone(default_nav_document);
	nav.nodes[nav.nodes.nav_logo.media].src = asset_a;
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(nav), nav_id);
	expect(referenced_assets(sqlite)).toContain(asset_a);
	sqlite.prepare('DELETE FROM translations WHERE document_id = ?').run(page_id);
	// The nav still refers to it.
	expect(referenced_assets(sqlite)).toContain(asset_a);
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(default_nav_document), nav_id);
	expect(referenced_assets(sqlite)).not.toContain(asset_a);
});

it('refuses to compute references while a stored translation is malformed', async () => {
	const id = default_page_document.document_id;
	const input = await load_input();
	replace_image(input, id, 'image', asset_a);
	await save_translated_document(input);
	sqlite.prepare('UPDATE translations SET value = ?').run('{invalid');
	expect(() => referenced_assets(sqlite)).toThrow();
});

it('composes 500 translated paragraphs with one full-document validation', async () => {
	const page: Document = structuredClone(default_page_document);
	const id = page.document_id;
	for (let index = 0; index < 500; index++) {
		const paragraph_id = `paragraph${index}`;
		const wrapper_id = `wrapper${index}`;
		page.nodes[paragraph_id] = {
			id: paragraph_id,
			type: 'paragraph',
			content: { content: `Original ${index}`, marks: [], annotations: [] }
		};
		page.nodes[wrapper_id] = {
			id: wrapper_id,
			type: 'prose',
			body: { nodes: [paragraph_id], marks: [], annotations: [] }
		};
		page.nodes[id].body.nodes.push(wrapper_id);
		store_translation(
			id,
			'de',
			paragraph_id,
			'content',
			JSON.stringify({ content: `Translated ${index}`, marks: [], annotations: [], nodes: {} }),
			'2026-10-02T00:00:00.000Z'
		);
	}
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(page), id);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(1);
	expect(Object.keys(stored_map(id))).toHaveLength(500);
	const validate = vi.spyOn(svedit, 'validate_document');
	try {
		const loaded = await translated_document(id, 'de');
		expect(validate).toHaveBeenCalledTimes(1);
		for (let index = 0; index < 500; index++)
			expect(loaded.document.nodes[`paragraph${index}`].content.content).toBe(
				`Translated ${index}`
			);
		expect((await translated_document(id, 'en')).document.nodes.paragraph499.content.content).toBe(
			'Original 499'
		);
	} finally {
		validate.mockRestore();
	}
});

it('rejects invalid overrides atomically while keeping valid translations and shared attachments', async () => {
	const page: Document = structuredClone(default_page_document);
	const id = page.document_id;
	const paragraph = Object.values(page.nodes).find((node) => node.type === 'paragraph')!;
	const wrapper = page.nodes[page.nodes[id].body.nodes[0]];
	paragraph.content = {
		content: 'Original',
		marks: [{ start_offset: 0, end_offset: 8, node_id: 'shared_mark' }],
		annotations: []
	};
	page.nodes.shared_mark = { id: 'shared_mark', type: 'strong' };
	page.nodes.other_paragraph = { ...paragraph, id: 'other_paragraph' };
	wrapper.body.nodes.push('other_paragraph');
	sqlite
		.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
		.run(JSON.stringify(page), id);
	const original_media = page.nodes[page.nodes[id].image];
	store_translation(
		id,
		'de',
		id,
		'title',
		JSON.stringify({ content: 'Valid title', marks: [], annotations: [], nodes: {} }),
		'2026-10-02T00:00:00.000Z'
	);
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		for (const value of [
			'{invalid',
			JSON.stringify({
				content: 'Bad',
				marks: [{ start_offset: 0, end_offset: 20, node_id: 'mark' }],
				annotations: [],
				nodes: { mark: { id: 'mark', type: 'strong' } }
			}),
			JSON.stringify({
				content: 'Bad',
				marks: [{ start_offset: 0, end_offset: 3, node_id: 'mark' }],
				annotations: [],
				nodes: { mark: { id: 'mark', type: 'link', href: 42, target: '_self' } }
			})
		]) {
			store_translation(id, 'de', paragraph.id, 'content', value, '2026-10-02T00:00:00.000Z');
			const loaded = (await translated_document(id, 'de')).document;
			expect(loaded.nodes[paragraph.id].content).toEqual(paragraph.content);
			expect(loaded.nodes.shared_mark).toEqual(page.nodes.shared_mark);
			expect(loaded.nodes.mark).toBeUndefined();
			expect(loaded.nodes[id].title.content).toBe('Valid title');
		}
		store_translation(
			id,
			'de',
			paragraph.id,
			'content',
			JSON.stringify({ content: 'Valid paragraph', marks: [], annotations: [], nodes: {} }),
			'2026-10-02T00:00:00.000Z'
		);
		store_translation(
			id,
			'de',
			id,
			'image',
			JSON.stringify({
				node_id: 'bad_media',
				nodes: { bad_media: { ...original_media, id: 'bad_media', width: 'invalid' } }
			}),
			'2026-10-02T00:00:00.000Z'
		);
		const loaded = (await translated_document(id, 'de')).document;
		expect(loaded.nodes[paragraph.id].content.content).toBe('Valid paragraph');
		expect(loaded.nodes.shared_mark).toEqual(page.nodes.shared_mark);
		expect(loaded.nodes[loaded.nodes[id].image]).toEqual(original_media);
		expect(loaded.nodes.bad_media).toBeUndefined();
		expect(log).toHaveBeenCalledTimes(4);
		expect(
			JSON.parse(
				(
					sqlite.prepare('SELECT data FROM documents WHERE document_id = ?').get(id) as {
						data: string;
					}
				).data
			)
		).toEqual(page);
	} finally {
		log.mockRestore();
	}
});

it.each(['/de/about', '/fr/about', '/about', 'https://example.com/de/about'])(
	'keeps %s stable across reloads and clears an override when restoring original text',
	async (href) => {
		const page: Document = structuredClone(default_page_document);
		const id = page.document_id;
		const paragraph = Object.values(page.nodes).find((node) => node.type === 'paragraph')!;
		paragraph.content = {
			content: 'Original',
			marks: [{ start_offset: 0, end_offset: 8, node_id: 'original_link' }],
			annotations: []
		};
		page.nodes.original_link = { id: 'original_link', type: 'link', href, target: '_self' };
		sqlite
			.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
			.run(JSON.stringify(page), id);
		const input = await load_input();
		input.nodes[paragraph.id].content.content = 'Deutsch!';
		await save_translated_document(input);
		const loaded = await load_input();
		expect((await load_input()).nodes).toEqual(loaded.nodes);
		const rows = sqlite.prepare('SELECT * FROM translations').all();
		await save_translated_document(loaded);
		expect(sqlite.prepare('SELECT * FROM translations').all()).toEqual(rows);
		loaded.nodes[paragraph.id].content.content = 'Original';
		await save_translated_document(loaded);
		expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
		paragraph.content.content = 'Updated original';
		paragraph.content.marks[0].end_offset = 16;
		sqlite
			.prepare('UPDATE documents SET data = ? WHERE document_id = ?')
			.run(JSON.stringify(page), id);
		expect((await load_input()).nodes[paragraph.id].content.content).toBe('Updated original');
	}
);

it('stores multiple overrides in one row and saves languages independently', async () => {
	const id = default_page_document.document_id;
	const german = await load_input('de');
	const french = await load_input('fr');
	german.nodes[id].title.content = 'German title';
	german.nodes[id].description.content = 'German description';
	await save_translated_document(german);
	french.nodes[id].title.content = 'French title';
	await save_translated_document(french);
	expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(2);
	expect(Object.keys(stored_map(id)[id])).toEqual(['title', 'description']);
	const loaded = await load_input();
	loaded.nodes[id].title.content = default_page_document.nodes[id].title.content;
	await save_translated_document(loaded);
	expect(Object.keys(stored_map(id)[id])).toEqual(['description']);
	expect((await load_input('fr')).nodes[id].title.content).toBe('French title');
	const columns = sqlite.prepare('PRAGMA table_info(translations)').all() as {
		name: string;
		pk: number;
	}[];
	expect(columns.filter((column) => column.pk).map((column) => column.name)).toEqual([
		'document_id',
		'language'
	]);
	expect(columns.map((column) => column.name)).not.toContain('node_id');
});

it('falls back on malformed maps and removes them during original cleanup', async () => {
	const id = default_page_document.document_id;
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		for (const value of ['{invalid', 'null', '[]', '{"broken":null}']) {
			sqlite
				.prepare('INSERT OR REPLACE INTO translations VALUES (?, ?, ?, ?)')
				.run(id, 'de', value, '2026-10-02T00:00:00.000Z');
			expect((await load_input()).nodes[id].title.content).toBe(
				default_page_document.nodes[id].title.content
			);
			await cleanup_translations(id);
			expect(sqlite.prepare('SELECT * FROM translations').all()).toHaveLength(0);
		}
	} finally {
		log.mockRestore();
	}
});
