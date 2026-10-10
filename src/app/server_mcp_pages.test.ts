import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en',
	ORIGIN: 'https://example.com',
	VERCEL: undefined
}));
vi.mock('#lib/server/db_snapshot.js', () => ({ snapshot_if_stale: vi.fn() }));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const db = new DatabaseSync(':memory:');
	return {
		db,
		asset_exists: () => true,
		touch_asset: vi.fn(),
		delete_orphaned_assets: vi.fn(),
		with_transaction: <T>(callback: () => T) => callback()
	};
});

import { db } from './services.js';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import {
	default_page_document,
	default_banner_document,
	default_nav_document,
	default_footer_document
} from './default_site.js';
import { read_mcp_page, save_mcp_page } from './server_mcp_pages.js';

const page_id = default_page_document.document_id;

afterAll(() => (db as DatabaseSync).close());

beforeEach(() => {
	db.exec(
		'DROP TABLE IF EXISTS documents; DROP TABLE IF EXISTS site_settings; DROP TABLE IF EXISTS document_refs; DROP TABLE IF EXISTS asset_refs; DROP TABLE IF EXISTS document_slugs; DROP TABLE IF EXISTS sessions; DROP TABLE IF EXISTS translations'
	);
	initial_schema.up({ db });
	translations_schema.up({ db });
	db.prepare("INSERT INTO site_settings VALUES ('home_page_id', ?)").run(page_id);
	for (const [type, doc] of [
		['page', default_page_document],
		['banner', default_banner_document],
		['nav', default_nav_document],
		['footer', default_footer_document]
	] as const) {
		db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?)').run(
			doc.document_id,
			type,
			JSON.stringify(doc),
			'v0',
			'v0'
		);
	}
});

function save(
	nodes: Record<string, unknown>,
	expected_updated_at = read_mcp_page('/').expected_updated_at
) {
	return save_mcp_page({ document_id: page_id, nodes, expected_updated_at });
}

function page_node() {
	return structuredClone(read_mcp_page('/').document.nodes[page_id]);
}

it('writes only changed documents', async () => {
	const page = page_node();
	page.title = { content: 'New title', marks: [], annotations: [] };
	await save({ [page_id]: page });

	const { document, expected_updated_at } = read_mcp_page('/');
	expect(document.nodes[page_id].title.content).toBe('New title');
	expect(expected_updated_at[page_id]).not.toBe('v0');
	for (const shared of [default_banner_document, default_nav_document, default_footer_document])
		expect(expected_updated_at[shared.document_id]).toBe('v0');
});

it('drops unlinked stored nodes but rejects unlinked new or changed nodes', async () => {
	const { nodes } = structuredClone(read_mcp_page('/').document);
	const removed_id = nodes[page_id].body.nodes.pop();
	const orphan = { ...nodes[removed_id], id: 'orphan' };
	await expect(save({ [page_id]: nodes[page_id], orphan })).rejects.toThrow(
		'not linked from the page: orphan'
	);

	await save(nodes);
	expect(read_mcp_page('/').document.nodes[removed_id]).toBeUndefined();
});

it('rejects stale versions, multiple owners, and shared reference changes', async () => {
	const stale = { ...read_mcp_page('/').expected_updated_at, [page_id]: 'stale' };
	await expect(save({}, stale)).rejects.toThrow('Page changed since it was read');

	const shared_owner = page_node();
	shared_owner.body.nodes.push(shared_owner.body.nodes[0]);
	await expect(save({ [page_id]: shared_owner })).rejects.toThrow('multiple owners');

	const moved_nav = { ...page_node(), nav: default_footer_document.document_id };
	await expect(save({ [page_id]: moved_nav })).rejects.toThrow('shared nav reference');

	expect(read_mcp_page('/').expected_updated_at[page_id]).toBe('v0');
});
