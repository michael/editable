import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { fill_document_defaults } from 'svedit';
import { document_schema } from './document_schema.js';
import {
	default_page_document,
	default_site_document,
	default_banner_document,
	default_nav_document,
	default_footer_document
} from './default_site.js';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en,de',
	ORIGIN: 'https://example.com',
	VERCEL: undefined,
	ADMIN_PASSWORD: 'test',
	NODE_ENV: 'test'
}));
vi.mock('$app/server', () => ({
	getRequestEvent: () => ({ locals: { is_admin: true } }),
	query: (schema_or_callback: object, callback?: object) =>
		Object.assign(callback ?? schema_or_callback, { __: { type: 'query' } }),
	command: (schema_or_callback: object, callback?: object) =>
		Object.assign(callback ?? schema_or_callback, { __: { type: 'command' } })
}));
vi.mock('#lib/server/db_snapshot.js', () => ({ snapshot_if_stale: vi.fn() }));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const db = new DatabaseSync(':memory:');
	return {
		db,
		with_transaction: (callback: () => unknown) => {
			db.exec('BEGIN');
			try {
				const result = callback();
				db.exec('COMMIT');
				return result;
			} catch (err) {
				db.exec('ROLLBACK');
				throw err;
			}
		},
		asset_exists: vi.fn(() => true),
		delete_orphaned_assets: vi.fn(),
		touch_asset: vi.fn()
	};
});

import { db } from './services.js';
import { languages } from './server_languages.js';
import {
	update_page_slug,
	delete_page,
	save_document,
	get_page_browser_data,
	get_sitemap_entries
} from './api.remote.js';
import { warn_about_language_slug_collisions } from './server_language_slugs.js';
import * as markdown_registry from './markdown/registry.js';

it('publishes localized sitemap URLs with translation dates while excluding hidden pages and redirects', async () => {
	const insert_doc = db.prepare(
		'INSERT INTO documents (document_id, type, data, updated_at) VALUES (?, ?, ?, ?)'
	);
	for (const doc of [
		default_page_document,
		default_banner_document,
		default_nav_document,
		default_footer_document
	])
		insert_doc.run(
			doc.document_id,
			doc.nodes[doc.document_id].type,
			JSON.stringify(doc),
			'2026-10-01T00:00:00Z'
		);
	db.prepare('INSERT INTO site_settings VALUES (?, ?)').run(
		'home_page_id',
		default_page_document.document_id
	);
	db.prepare('UPDATE documents SET updated_at = ? WHERE document_id = ?').run(
		'2026-10-02T00:00:00Z',
		default_nav_document.document_id
	);
	const insert_slug = db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)');
	for (const slug of ['about', 'de', 'manual', 'unlisted']) {
		const doc = structuredClone(default_page_document);
		const root = doc.nodes[doc.document_id];
		delete doc.nodes[doc.document_id];
		doc.document_id = `${slug}-page`;
		doc.nodes[doc.document_id] = {
			...root,
			id: doc.document_id,
			body: { nodes: [], marks: [], annotations: [] }
		};
		insert_doc.run(doc.document_id, 'page', JSON.stringify(doc), '2026-10-01T00:00:00Z');
		insert_slug.run(slug, doc.document_id, 1, 'now');
		if (slug !== 'unlisted')
			db.prepare('INSERT INTO document_refs VALUES (?, ?, ?)').run(
				doc.document_id,
				default_nav_document.document_id,
				0
			);
	}
	insert_slug.run('old-about', 'about-page', 0, 'now');
	for (const [document_id, language, date] of [
		['about-page', 'de', '2026-10-03T00:00:00Z'],
		[default_nav_document.document_id, 'de', '2026-10-04T00:00:00Z'],
		['about-page', 'es', '2026-10-05T00:00:00Z']
	])
		db.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)').run(
			document_id,
			language,
			'{}',
			date
		);
	const entries = await get_sitemap_entries();
	expect(entries.map((entry) => entry.path).sort()).toEqual([
		'/',
		'/about',
		'/de',
		'/de/about',
		'/manual'
	]);
	expect(entries.find((entry) => entry.path === '/about')?.lastmod).toBe(
		'2026-10-02T00:00:00.000Z'
	);
	expect(entries.find((entry) => entry.path === '/de/about')?.lastmod).toBe(
		'2026-10-04T00:00:00.000Z'
	);
	expect(entries.find((entry) => entry.path === '/about')?.alternates).toEqual(
		entries.find((entry) => entry.path === '/de/about')?.alternates
	);
	languages.splice(0);
	const disabled = await get_sitemap_entries();
	expect(disabled.some((entry) => entry.path === '/de/about')).toBe(false);
	expect(disabled.find((entry) => entry.path === '/about')).toMatchObject({
		alternates: [],
		lastmod: '2026-10-02T00:00:00.000Z'
	});
});

afterAll(() => db.close());
beforeEach(() => {
	vi.restoreAllMocks();
	languages.splice(0, languages.length, 'en', 'de');
	for (const table of [
		'documents',
		'site_settings',
		'document_refs',
		'asset_refs',
		'document_slugs',
		'sessions',
		'translations'
	])
		db.exec(`DROP TABLE IF EXISTS ${table}`);
	initial_schema.up({ db });
	translations_schema.up({ db });
});

it('rejects a language homepage slug without changing the page or its links', async () => {
	const page = structuredClone(default_page_document);
	db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
		page.document_id,
		'page',
		JSON.stringify(page)
	);
	db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)').run(
		'about',
		page.document_id,
		1,
		'now'
	);
	expect(await update_page_slug({ document_id: page.document_id, slug: ' DE ' })).toMatchObject({
		ok: false,
		code: 'page_url_reserved'
	});
	expect(db.prepare('SELECT slug FROM document_slugs WHERE is_active = 1').get()).toMatchObject({
		slug: 'about'
	});
	expect(db.prepare('SELECT data FROM documents').get()).toMatchObject({
		data: JSON.stringify(page)
	});
});

it('flags language collisions in the page browser and clears the flag after renaming', async () => {
	const page = structuredClone(default_page_document);
	db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
		page.document_id,
		'page',
		JSON.stringify(page)
	);
	db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)').run(
		'de',
		page.document_id,
		1,
		'now'
	);
	const browser = await get_page_browser_data('https://example.com/');
	expect(browser.page_forest[0]).toMatchObject({
		document_id: page.document_id,
		slug: 'de',
		shadowed_by_language: true,
		shadowed_by_markdown: false
	});
	languages.splice(0);
	expect((await get_page_browser_data('https://example.com/')).page_forest[0]).toMatchObject({
		shadowed_by_language: false
	});
	languages.push('en', 'de');
	expect(
		await update_page_slug({ document_id: page.document_id, slug: 'spanish-page' })
	).toMatchObject({
		ok: true
	});
	expect((await get_page_browser_data('https://example.com/')).page_forest[0]).toMatchObject({
		document_id: page.document_id,
		slug: 'spanish-page',
		shadowed_by_language: false
	});
});

it.each([
	{ configured: ['en', 'de'], title: 'De', expected: 'de-3' },
	{ configured: ['en', 'de'], title: 'En', expected: 'en' },
	{ configured: [], title: 'De', expected: 'de' }
])(
	'generates an available page URL with languages $configured and title $title',
	async ({ configured, title, expected }) => {
		languages.splice(0, languages.length, ...configured);
		const page = structuredClone(default_site_document);
		page.nodes[page.document_id].title = { content: title, marks: [], annotations: [] };
		db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)').run(
			'de-2',
			'other-page',
			1,
			'now'
		);
		expect(await save_document({ ...page, create: true })).toMatchObject({
			ok: true,
			slug: expected
		});
	}
);

it('warns about active pages, historical redirects, and markdown language collisions at startup', () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(markdown_registry, 'get_markdown_page_pathnames').mockReturnValue(['/de', '/manual']);
	db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
		'page',
		'page',
		'{}'
	);
	const insert = db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)');
	insert.run('de', 'page', 1, 'now');
	insert.run('es', 'page', 0, 'now');
	insert.run('en', 'page', 0, 'now');
	languages.push('es');
	warn_about_language_slug_collisions();
	expect(warn.mock.calls.map(([message]) => message)).toEqual([
		expect.stringContaining('Page "/de" (page)'),
		expect.stringContaining('Historical redirect "/es" (page)'),
		expect.stringContaining('Markdown page "/de"')
	]);
	warn.mockClear();
	languages.splice(0);
	warn_about_language_slug_collisions();
	expect(warn).not.toHaveBeenCalled();
	expect(db.prepare('SELECT slug FROM document_slugs').all()).toHaveLength(3);
});

it.each([false, true])(
	'rewrites stored language links with multilingual disabled=%s',
	async (disabled) => {
		if (disabled) languages.splice(0);
		const page = fill_document_defaults(structuredClone(default_page_document), document_schema);
		const id = page.document_id;
		page.nodes['original_link'] = { id: 'original_link', type: 'link', href: '/fr/about' };
		db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
			id,
			'page',
			JSON.stringify(page)
		);
		db.prepare('INSERT INTO document_slugs VALUES (?, ?, ?, ?)').run(
			'about',
			id,
			1,
			'2026-10-02T00:00:00.000Z'
		);
		for (const language of ['de', 'fr']) {
			const map = {
				[id]: {
					title: { content: 'Translated title', marks: [], annotations: [], nodes: {} },
					description: {
						content: 'About',
						marks: [{ start_offset: 0, end_offset: 5, node_id: 'translated_link' }],
						annotations: [],
						nodes: {
							translated_link: {
								id: 'translated_link',
								type: 'link',
								href: '/fr/about?ref=test#anchor',
								target: '_self'
							}
						}
					}
				}
			};
			db.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)').run(
				id,
				language,
				JSON.stringify(map),
				'2026-10-02T00:00:00.000Z'
			);
		}
		const result = await update_page_slug({ document_id: id, slug: 'updated' });
		expect(result).toMatchObject({ ok: true, page_href: '/updated' });
		const original_row = db.prepare('SELECT data FROM documents WHERE document_id = ?').get(id) as {
			data: string;
		};
		expect(JSON.parse(original_row.data).nodes.original_link.href).toBe('/fr/updated');
		for (const language of ['de', 'fr']) {
			const row = db
				.prepare('SELECT value FROM translations WHERE document_id = ? AND language = ?')
				.get(id, language) as { value: string };
			const map = JSON.parse(row.value);
			expect(map[id].description.nodes.translated_link.href).toBe('/fr/updated?ref=test#anchor');
			expect(map[id].title.content).toBe('Translated title');
		}
	}
);

it('deletes all stored translations with the original page when multilingual support is disabled', async () => {
	languages.splice(0);
	const page = fill_document_defaults(structuredClone(default_page_document), document_schema);
	const id = page.document_id;
	db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
		id,
		'page',
		JSON.stringify(page)
	);
	for (const language of ['de', 'es']) {
		db.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)').run(
			id,
			language,
			JSON.stringify({
				[id]: { title: { content: 'Translated', nodes: {}, marks: [], annotations: [] } }
			}),
			'now'
		);
	}
	await delete_page({ document_id: id });
	expect(db.prepare('SELECT * FROM translations').all()).toEqual([]);
	expect(db.prepare('SELECT * FROM documents').all()).toEqual([]);
});
