import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { fill_document_defaults } from 'svedit';
import { document_schema } from './document_schema.js';
import { default_page_document } from './default_site.js';
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
import { update_page_slug } from './api.remote.js';

afterAll(() => db.close());
beforeEach(() => {
	initial_schema.up({ db });
	translations_schema.up({ db });
});

it('rewrites links inside every property map, including disabled languages, when a page slug changes', async () => {
	const page = fill_document_defaults(structuredClone(default_page_document), document_schema);
	const id = page.document_id;
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
							href: `/${language}/about?ref=test#anchor`,
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
	for (const language of ['de', 'fr']) {
		const row = db
			.prepare('SELECT value FROM translations WHERE document_id = ? AND language = ?')
			.get(id, language) as { value: string };
		const map = JSON.parse(row.value);
		expect(map[id].description.nodes.translated_link.href).toBe(
			`/${language}/updated?ref=test#anchor`
		);
		expect(map[id].title.content).toBe('Translated title');
	}
});
