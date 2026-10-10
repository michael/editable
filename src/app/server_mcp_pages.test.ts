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
import { create_mcp_page, read_mcp_page, save_mcp_page } from './server_mcp_pages.js';

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

function save(nodes: Record<string, unknown>, expected_version = read_mcp_page('/').version!) {
	return save_mcp_page({ document_id: page_id, nodes, expected_version });
}

function updated_at(document_id: string) {
	return (
		db.prepare('SELECT updated_at FROM documents WHERE document_id = ?').get(document_id) as {
			updated_at: string;
		}
	).updated_at;
}

function page_node() {
	return structuredClone(read_mcp_page('/').document.nodes[page_id]);
}

it('writes only changed documents and versions the result', async () => {
	const { version } = read_mcp_page('/');
	const page = page_node();
	page.title = { content: 'New title', marks: [], annotations: [] };
	const result = await save({ [page_id]: page }, version!);

	expect(read_mcp_page('/')).toMatchObject({ version: result.version });
	expect(read_mcp_page('/').document.nodes[page_id].title.content).toBe('New title');
	expect(updated_at(page_id)).not.toBe('v0');
	for (const shared of [default_banner_document, default_nav_document, default_footer_document])
		expect(updated_at(shared.document_id)).toBe('v0');

	// The returned version continues editing; the version it replaced is stale.
	await save({}, result.version);
	await expect(save({}, version!)).rejects.toThrow('Page changed since it was read');
});

it('fills omitted properties of submitted nodes with defaults', async () => {
	const page = page_node();
	page.body.nodes.push('new_prose');
	await save({
		[page_id]: page,
		new_prose: { id: 'new_prose', type: 'prose', body: { nodes: ['new_paragraph'] } },
		new_paragraph: {
			id: 'new_paragraph',
			type: 'paragraph',
			content: { content: 'Hi', marks: [], annotations: [] }
		}
	});

	const { nodes } = read_mcp_page('/').document;
	expect(nodes.new_prose.layout).toBe('narrow-left');
	expect(nodes.new_paragraph.layout).toBe('regular');
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

it('rejects multiple owners and shared reference changes', async () => {
	const { version } = read_mcp_page('/');

	const shared_owner = page_node();
	shared_owner.body.nodes.push(shared_owner.body.nodes[0]);
	await expect(save({ [page_id]: shared_owner })).rejects.toThrow('multiple owners');

	const moved_nav = { ...page_node(), nav: default_footer_document.document_id };
	await expect(save({ [page_id]: moved_nav })).rejects.toThrow('shared nav reference');

	expect(read_mcp_page('/').version).toBe(version);
});

it('creates pages linked to the shared documents with a slug from the title', async () => {
	const create = (document_id: string, nodes: Record<string, unknown> = {}) =>
		create_mcp_page({
			document_id,
			nodes: {
				[document_id]: {
					id: document_id,
					type: 'page',
					title: { content: 'About us' },
					body: { nodes: [`${document_id}_text`] }
				},
				[`${document_id}_text`]: {
					id: `${document_id}_text`,
					type: 'code_block',
					content: { content: 'Hello' }
				},
				...nodes
			}
		});

	const result = await create('about');
	expect(result.page_href).toBe('/about-us');
	const { document, version } = read_mcp_page('/about-us');
	expect(version).toBe(result.version);
	expect(document.nodes.about.nav).toBe(default_nav_document.document_id);
	expect(document.nodes[document.nodes.about.image].type).toBe('image');
	expect((await create('about_again')).page_href).toBe('/about-us-2');

	await expect(create('about')).rejects.toThrow('already exists');
	const nav_root = default_nav_document.nodes[default_nav_document.document_id];
	await expect(create('clash', { [nav_root.id]: nav_root })).rejects.toThrow(
		'belong to the shared banner, navigation, or footer'
	);
	await expect(create('orphaned', { stray: { id: 'stray', type: 'paragraph' } })).rejects.toThrow(
		'not linked from the page: stray'
	);
});
