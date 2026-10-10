import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en,de',
	ORIGIN: 'https://example.com',
	VERCEL: undefined
}));
vi.mock('#lib/server/db_snapshot.js', () => ({ snapshot_if_stale: vi.fn() }));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const db = new DatabaseSync(':memory:');
	const asset_dir = mkdtempSync(join(tmpdir(), 'editable-assets-'));
	return {
		db,
		asset_exists: () => true,
		asset_path: (asset_id: string) => join(asset_dir, asset_id),
		variant_path: (asset_id: string, width: number) =>
			join(asset_dir, asset_id.replace(/\.[^.]+$/, ''), `w${width}.webp`),
		touch_asset: vi.fn(),
		delete_orphaned_assets: vi.fn(),
		with_transaction: <T>(callback: () => T) => callback()
	};
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { asset_path, db, variant_path } from './services.js';
import { webp_bytes } from './test_helpers/webp.js';
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

function create(document_id: string, nodes: Record<string, unknown> = {}) {
	return create_mcp_page({
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

it('resolves pages by path, URL, language prefix, old slug, and document id', async () => {
	await create('about');
	db.prepare("INSERT INTO document_slugs VALUES ('old-about', 'about', 0, 'v0')").run();

	for (const page of [
		'/about-us',
		'about',
		'https://www.example.com/about-us?ref=1#top',
		'/old-about/'
	])
		expect(read_mcp_page(page).page_href).toBe('/about-us');
	// A language prefix reads that language's version.
	expect(read_mcp_page('/de/old-about').page_href).toBe('/de/about-us');
	expect(read_mcp_page('https://example.com/de').page_href).toBe('/de');
	expect(() => read_mcp_page('/missing')).toThrow('Page not found: /missing');
});

it('reads and saves translations without structural changes', async () => {
	await create('about');
	const de = read_mcp_page('/de/about-us');
	expect(de).toMatchObject({ page_href: '/de/about-us', language: 'de', languages: ['en', 'de'] });
	const title = (content: string) => ({
		about: { ...de.document.nodes.about, title: { content, marks: [], annotations: [] } }
	});
	const translate = (nodes: Record<string, unknown>, expected_version: string) =>
		save_mcp_page({ document_id: 'about', nodes, expected_version, language: 'de' });

	const saved = await translate(title('Über uns'), de.version!);
	expect(saved).toMatchObject({ page_href: '/de/about-us', title: 'Über uns' });
	expect(read_mcp_page('about', 'de')).toMatchObject({ version: saved.version });
	expect(read_mcp_page('/about-us').document.nodes.about.title.content).toBe('About us');

	const restructured = { about: { ...title('Über uns').about, body: { nodes: [] } } };
	await expect(translate(restructured, saved.version)).rejects.toThrow(
		'Translations can save text, inline formatting, and media only'
	);
	expect(() => read_mcp_page('/about-us', 'fr')).toThrow('Language fr is not enabled');

	// Text equal to the main language removes the translation.
	await translate(title('About us'), saved.version);
	expect(db.prepare('SELECT value FROM translations').all()).toEqual([]);
});

it('requires new images to match their file and have every variant', async () => {
	const asset_id = `${'a'.repeat(64)}.webp`;
	writeFileSync(asset_path(asset_id), webp_bytes(1000, 500));
	const page = page_node();
	page.body.nodes.push('figure');
	const nodes = (width: number) => ({
		[page_id]: page,
		figure: { id: 'figure', type: 'figure', media: 'figure_image' },
		figure_image: {
			id: 'figure_image',
			type: 'image',
			src: asset_id,
			mime_type: 'image/webp',
			width,
			height: 500
		}
	});

	await expect(save(nodes(1000))).rejects.toThrow('is missing variants 320, 640');
	for (const width of [320, 640]) {
		mkdirSync(dirname(variant_path(asset_id, width)), { recursive: true });
		writeFileSync(variant_path(asset_id, width), webp_bytes(width, width / 2));
	}
	await expect(save(nodes(1200))).rejects.toThrow('do not match');
	await save(nodes(1000));
	expect(read_mcp_page('/').document.nodes.figure_image.src).toBe(asset_id);
});
