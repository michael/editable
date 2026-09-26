import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en,de,fr',
	ORIGIN: 'https://example.com',
	VERCEL: undefined
}));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const db = new DatabaseSync(':memory:');
	return {
		db,
		asset_exists: vi.fn(() => true),
		with_transaction: (callback: () => unknown) => {
			db.exec('BEGIN');
			try {
				const result = callback();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		}
	};
});

import { db, asset_exists } from './services.js';
import migration from './migrations/20260923T180000000Z_editable_translations.js';
import {
	default_page_document,
	default_nav_document,
	default_footer_document
} from './default_site.js';
import {
	cleanup_translations,
	save_translated_document,
	translated_document
} from './server_translations.js';
import {
	text_properties,
	property_payload,
	replace_translation,
	translation_properties
} from './translations.js';
import { rebuild_asset_refs } from './server_asset_refs.js';
import { referenced_assets } from '../../scripts/asset-references.js';

afterAll(() => (db as DatabaseSync).close());

beforeEach(() => {
	db.exec(
		'DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS asset_refs; DROP TABLE IF EXISTS translations'
	);
	vi.mocked(asset_exists).mockReturnValue(true);
	db.exec(
		'CREATE TABLE documents (document_id TEXT PRIMARY KEY, data TEXT); CREATE TABLE asset_refs (asset_id TEXT, document_id TEXT, PRIMARY KEY (asset_id, document_id))'
	);
	migration.up({ db });
	for (const doc of [default_page_document, default_nav_document, default_footer_document]) {
		db.prepare('INSERT INTO documents VALUES (?, ?)').run(doc.document_id, JSON.stringify(doc));
	}
});

it('saves sparse page/shared translations, protects originals, rejects stale and structural saves, and resets equal text', () => {
	const originals = db.prepare('SELECT * FROM documents ORDER BY document_id').all();
	const id = default_page_document.document_id;
	const loaded = translated_document(id, 'de');
	const input = {
		...loaded.document,
		language: 'de',
		translation_revision: loaded.translation_revision
	};
	// Saving fallback text alone must not create any rows.
	save_translated_document(input);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	input.nodes[id].title.content = 'Deutscher Titel';
	const footer_property = text_properties(default_footer_document)[0];
	input.nodes[footer_property.node_id][footer_property.property_id].content = 'Deutsche Fußzeile';
	save_translated_document(input);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(2);
	const stored = db
		.prepare('SELECT value FROM translations WHERE node_id = ? AND property_id = ?')
		.get(id, 'title') as { value: string };
	expect(JSON.parse(stored.value)).toEqual({
		content: 'Deutscher Titel',
		marks: [],
		annotations: [],
		nodes: {}
	});
	expect(
		db
			.prepare('SELECT * FROM translations WHERE document_id = ?')
			.all(default_footer_document.document_id)
	).toHaveLength(1);
	expect(db.prepare('SELECT * FROM documents ORDER BY document_id').all()).toEqual(originals);
	expect(() => save_translated_document(input)).toThrow();
	const translated = translated_document(id, 'de');
	expect(translated.document.nodes[id].title.content).toBe('Deutscher Titel');
	const original = translated_document(id, 'en');
	const invalid = structuredClone(translated.document);
	invalid.nodes[id].body.nodes = [];
	expect(() =>
		save_translated_document({
			...invalid,
			language: 'de',
			translation_revision: translated.translation_revision
		})
	).toThrow();
	save_translated_document({
		...original.document,
		language: 'de',
		translation_revision: translated.translation_revision
	});
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
});

const asset_a = `${'a'.repeat(64)}.webp`;
const asset_b = `${'b'.repeat(64)}.mp4`;

function load_input(language = 'de') {
	const loaded = translated_document(default_page_document.document_id, language);
	return { ...loaded.document, language, translation_revision: loaded.translation_revision };
}

function replace_image(
	input: ReturnType<typeof load_input>,
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

it('stores media overrides, loads original fallback, and retains assets across languages and original saves', () => {
	const id = default_page_document.document_id;
	const original = translated_document(id, 'en').document;
	const input = load_input();
	replace_image(input, id, 'image', asset_a);
	save_translated_document(input);
	const row = db
		.prepare('SELECT value FROM translations WHERE node_id = ? AND property_id = ?')
		.get(id, 'image') as { value: string };
	const payload = JSON.parse(row.value);
	expect(payload.node_id).toBe('translated_media');
	expect(payload.nodes.translated_media.src).toBe(asset_a);
	const loaded = load_input();
	expect(loaded.nodes[loaded.nodes[id].image].alt).toBe('Übersetztes Medium');
	expect(translated_document(id, 'en').document).toEqual(original);
	expect(translated_document(id, 'fr').document).toEqual(original);
	const french = load_input('fr');
	replace_image(french, id, 'image', asset_a);
	save_translated_document(french);
	// Rebuilding after an original save must retain translation-only assets.
	cleanup_translations(id);
	rebuild_asset_refs(id);
	expect(referenced_assets(db)).toContain(asset_a);
	expect(db.prepare('SELECT * FROM asset_refs WHERE asset_id = ?').all(asset_a)).toHaveLength(1);
	for (const language of ['de', 'fr']) {
		const reset = load_input(language);
		replace_translation(reset, id, 'image', property_payload(original, id, 'image'));
		save_translated_document(reset);
		expect(db.prepare('SELECT * FROM asset_refs WHERE asset_id = ?').all(asset_a)).toHaveLength(
			language === 'de' ? 1 : 0
		);
	}
	expect(referenced_assets(db)).not.toContain(asset_a);
});

it('translates shared navigation media to video and releases references after its property is removed', () => {
	const input = load_input();
	const media_property = translation_properties(default_nav_document).find(
		({ node_id, property_id }) =>
			property_id === 'media' && default_nav_document.nodes[node_id].type === 'nav_media'
	)!;
	expect(media_property).toBeDefined();
	const { node_id, property_id } = media_property;
	replace_image(input, node_id, property_id, asset_b, 'video');
	save_translated_document(input);
	const loaded = load_input();
	expect(loaded.nodes[loaded.nodes[node_id][property_id]].type).toBe('video');
	expect(db.prepare('SELECT document_id FROM asset_refs WHERE asset_id = ?').get(asset_b)).toEqual({
		document_id: default_nav_document.document_id
	});
	const nav = structuredClone(default_nav_document);
	delete nav.nodes[node_id];
	db.prepare('UPDATE documents SET data = ? WHERE document_id = ?').run(
		JSON.stringify(nav),
		nav.document_id
	);
	cleanup_translations(nav.document_id);
	rebuild_asset_refs(nav.document_id);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(db.prepare('SELECT * FROM asset_refs WHERE asset_id = ?').all(asset_b)).toHaveLength(0);
});

it('rejects unuploaded media, stale saves, extraneous nodes and structural changes without changing references', () => {
	const id = default_page_document.document_id;
	const input = load_input();
	replace_image(input, id, 'image', 'blob:pending');
	expect(() => save_translated_document(input)).toThrow('Upload translated media');
	input.nodes[input.nodes[id].image].src = asset_a;
	vi.mocked(asset_exists).mockReturnValue(false);
	expect(() => save_translated_document(input)).toThrow('Upload translated media');
	vi.mocked(asset_exists).mockReturnValue(true);
	const orphan = structuredClone(input);
	orphan.nodes.unrelated = { ...input.nodes[input.nodes[id].image], id: 'unrelated' };
	expect(() => save_translated_document(orphan)).toThrow();
	const invalid = structuredClone(input);
	invalid.nodes[id].body.nodes = [];
	expect(() => save_translated_document(invalid)).toThrow();
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(db.prepare('SELECT * FROM asset_refs').all()).toHaveLength(0);
	save_translated_document(input);
	expect(() => save_translated_document(input)).toThrow();
	expect(db.prepare('SELECT * FROM asset_refs WHERE asset_id = ?').all(asset_a)).toHaveLength(1);
	// Deleting the owning document releases translations and their assets too.
	db.prepare('DELETE FROM documents WHERE document_id = ?').run(id);
	cleanup_translations(id);
	rebuild_asset_refs(id);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	expect(db.prepare('SELECT * FROM asset_refs WHERE asset_id = ?').all(asset_a)).toHaveLength(0);
});
