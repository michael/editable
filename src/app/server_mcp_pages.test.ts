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
import { combine_page_document, get_doc_from_db } from './server_documents.js';
import { create_mcp_page, read_mcp_page, save_mcp_page } from './server_mcp_pages.js';

const page_id = default_page_document.document_id;
const banner_id = default_banner_document.document_id;
const nav_id = default_nav_document.document_id;
const footer_id = default_footer_document.document_id;

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

const read = (page = '/', language?: string, include_shared = false) =>
	read_mcp_page(page, language, include_shared);

function save(edf: string, expected_version = read().version!) {
	return save_mcp_page({ edf, expected_version });
}

function updated_at(document_id: string) {
	return (
		db.prepare('SELECT updated_at FROM documents WHERE document_id = ?').get(document_id) as {
			updated_at: string;
		}
	).updated_at;
}

const page_json = () => combine_page_document(get_doc_from_db(page_id));

/** Set the page title, which the default page leaves empty. */
function set_title(edf: string, title: string) {
	return /<title>/.test(edf)
		? edf.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
		: edf.replace(/^(<page[^>]*>\n)/, `$1\t<title>${title}</title>\n`);
}

/** Add blocks at the end of the page body. */
function append_blocks(edf: string, blocks: string) {
	return edf.replace(/\n\t<\/body>\n<\/page>\n$/, `\n${blocks}\n\t</body>\n</page>\n`);
}

function create(
	document_id: string,
	body = '<prose><body><paragraph>Hello</paragraph></body></prose>',
	slug?: string
) {
	return create_mcp_page({
		edf: `<page id="${document_id}"><title>About us</title><body>${body}</body></page>`,
		slug
	});
}

it('writes only changed documents, versions the result, and skips saves without edits', async () => {
	const { edf, version } = read();
	expect(edf).toMatch(
		new RegExp(
			`^<page id="${page_id}" banner="${banner_id}" nav="${nav_id}" footer="${footer_id}">`
		)
	);
	expect(edf).not.toContain(`<nav id="${nav_id}"`);
	expect((await save(edf, version!)).version).toBe(version);
	expect(updated_at(page_id)).toBe('v0');

	const result = await save(set_title(edf, 'New &amp; improved'), version!);
	expect(result.version).not.toBe(version);
	expect(read()).toMatchObject({ version: result.version });
	expect(page_json().nodes[page_id].title.content).toBe('New & improved');
	expect(updated_at(page_id)).not.toBe('v0');
	for (const id of [banner_id, nav_id, footer_id]) expect(updated_at(id)).toBe('v0');

	// The returned version continues editing; the version it replaced is stale.
	await save(read().edf, result.version);
	await expect(save(edf, version!)).rejects.toThrow('Page changed since it was read');
});

it('fills defaults and assigns ids to new nodes and marks', async () => {
	await save(
		append_blocks(
			read().edf,
			'\t\t<prose><body><paragraph>Hi <strong>there</strong></paragraph></body></prose>'
		)
	);
	const { nodes } = page_json();
	const paragraph = Object.values(nodes).find((node) => node.content?.content === 'Hi there')!;
	expect(paragraph).toMatchObject({ type: 'paragraph', layout: 'regular' });
	expect(paragraph.id).toMatch(/^[A-Za-z]{23}$/);
	expect(paragraph.content.marks).toEqual([
		{ start_offset: 3, end_offset: 8, node_id: expect.stringMatching(/^[A-Za-z]{23}$/) }
	]);
	expect(nodes[paragraph.content.marks[0].node_id].type).toBe('strong');
	const prose = Object.values(nodes).find((node) => node.body?.nodes.includes(paragraph.id))!;
	expect(prose).toMatchObject({ type: 'prose', layout: 'narrow-left' });
	expect(nodes[page_id].body.nodes.at(-1)).toBe(prose.id);
});

it('drops nodes left out of the document', async () => {
	const { nodes } = page_json();
	const removed_id = nodes[page_id].body.nodes.at(-1)!;
	const type = nodes[removed_id].type;
	const element = new RegExp(
		`\\n\\t*<${type} id="${removed_id}"(?:[^>]*/>|[^>]*>[\\s\\S]*?\\n\\t*</${type}>)`
	);
	const { edf } = read();
	expect(edf).toMatch(element);
	await save(edf.replace(element, ''));
	expect(page_json().nodes[removed_id]).toBeUndefined();
	expect(page_json().nodes[page_id].body.nodes).not.toContain(removed_id);
});

it('rejects duplicate ids, unsafe links, misplaced marks, and shared reference changes', async () => {
	const { edf, version } = read();
	const first_block = page_json().nodes[page_id].body.nodes[0];
	const duplicated = append_blocks(
		edf,
		`\t\t<prose id="${first_block}"><body><paragraph>x</paragraph></body></prose>`
	);
	await expect(save(duplicated, version!)).rejects.toThrow('duplicate node id');

	const scripted = append_blocks(
		edf,
		'\t\t<prose><body><paragraph>see <link href=" java\tscript:alert(1)">x</link></paragraph></body></prose>'
	);
	await expect(save(scripted, version!)).rejects.toThrow('Unsafe href');

	await expect(save(set_title(edf, '<strong>Bold</strong>'), version!)).rejects.toThrow(
		'<strong> is not allowed in page.title'
	);

	const moved_nav = edf.replace(`nav="${nav_id}"`, `nav="${footer_id}"`);
	await expect(save(moved_nav, version!)).rejects.toThrow('shared nav reference');
	expect(read().version).toBe(version);
});

it('includes the shared documents on request and saves them with the page', async () => {
	const { edf, version } = read('/', undefined, true);
	expect(edf).toContain(`\n\t<nav>\n\t\t<nav id="${nav_id}"`);
	expect(edf).not.toContain(`nav="${nav_id}"`);
	expect((await save(edf, version!)).version).toBe(version);
	expect(updated_at(nav_id)).toBe('v0');

	// Filling in a nav link changes the nav document, not the page.
	const edited = edf.replace(
		/<nav_link id="(\w+)"\/>/,
		'<nav_link id="$1" href="/about"><label>Renamed</label></nav_link>'
	);
	expect(edited).not.toBe(edf);
	await save(edited, version!);
	expect(updated_at(nav_id)).not.toBe('v0');
	expect(updated_at(page_id)).toBe('v0');
	expect(JSON.stringify(get_doc_from_db(nav_id))).toContain('Renamed');
});

it('creates pages linked to the shared documents with a slug from the title', async () => {
	const result = await create('about');
	expect(result).toMatchObject({ page_href: '/about-us', title: 'About us' });
	const { edf, version } = read('/about-us');
	expect(version).toBe(result.version);
	expect(edf).toContain(`nav="${nav_id}"`);
	expect(edf).toMatch(/<image>\n\t\t<image id="[A-Za-z]{23}"\/>\n\t<\/image>/);
	expect((await create('about_again')).page_href).toBe('/about-us-2');
	// Editable's own routes keep their paths.
	expect((await create('routed', undefined, 'mcp')).page_href).toBe('/mcp-2');

	await expect(create('about')).rejects.toThrow('already exists');
	await expect(create_mcp_page({ edf: '<page><title>No id</title></page>' })).rejects.toThrow(
		'needs an id attribute'
	);
	await expect(
		create('clash', `<prose id="${nav_id}"><body><paragraph>x</paragraph></body></prose>`)
	).rejects.toThrow('belong to the shared banner, navigation, or footer');
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
	const de = read('/de/about-us');
	expect(de).toMatchObject({ page_href: '/de/about-us', language: 'de', languages: ['en', 'de'] });
	const translate = (edf: string, expected_version: string) =>
		save_mcp_page({ edf, expected_version, language: 'de' });

	const saved = await translate(set_title(de.edf, 'Über uns'), de.version!);
	expect(saved).toMatchObject({ page_href: '/de/about-us', title: 'Über uns' });
	expect(read('about', 'de')).toMatchObject({ version: saved.version });
	expect(read('/about-us').edf).toContain('<title>About us</title>');
	expect(read('/de/about-us').edf).toContain('<title>Über uns</title>');

	const restructured = read('/de/about-us').edf.replace(/<body>[\s\S]*<\/body>/, '<body></body>');
	await expect(translate(restructured, saved.version)).rejects.toThrow(
		'Translations can save text, inline formatting, and media only'
	);
	expect(() => read('/about-us', 'fr')).toThrow('Language fr is not enabled');

	// Text equal to the main language removes the translation.
	await translate(set_title(read('/de/about-us').edf, 'About us'), saved.version);
	expect(db.prepare('SELECT value FROM translations').all()).toEqual([]);
});

it('requires new images to match their file and have every variant', async () => {
	const asset_id = `${'a'.repeat(64)}.webp`;
	writeFileSync(asset_path(asset_id), webp_bytes(1000, 500));
	const figure = (width: number) =>
		`\t\t<figure id="figure"><media><image id="figure_image" src="${asset_id}" mime_type="image/webp" width="${width}" height="500"/></media></figure>`;
	const { edf, version } = read();

	await expect(save(append_blocks(edf, figure(1000)), version!)).rejects.toThrow(
		'is missing variants 320, 640'
	);
	for (const width of [320, 640]) {
		mkdirSync(dirname(variant_path(asset_id, width)), { recursive: true });
		writeFileSync(variant_path(asset_id, width), webp_bytes(width, width / 2));
	}
	await expect(save(append_blocks(edf, figure(1200)), version!)).rejects.toThrow('do not match');
	await save(append_blocks(edf, figure(1000)), version!);
	expect(read().edf).toContain(`<image id="figure_image" src="${asset_id}"`);
});
