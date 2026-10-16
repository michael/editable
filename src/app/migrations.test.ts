import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OpenedStore } from '#lib/server/storage/store.js';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import { migrate, migrate_storage } from './migrations.js';
import { open_file_folder, open_sqlite_folder } from './storage.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-migrations-'));
	dirs.push(dir);
	return dir;
}

const content_applied = ({ store }: OpenedStore) =>
	JSON.parse(store.settings.get('migrations')?.value ?? '[]') as string[];

it('seeds a new site and records every migration as applied, on files and on SQLite', () => {
	for (const open of [open_file_folder, open_sqlite_folder]) {
		const opened = open(temp_dir());
		migrate(opened);
		expect(opened.store.settings.get('home_page_id')).not.toBeNull();
		expect(content_applied(opened)).toContain('20261009T120000000Z_editable_site_banner');
		expect(opened.migrations.applied()).toContain(
			`20261016T120000000Z_editable_setting_records_${opened.migrations.target}`
		);
		// Running again changes nothing.
		const documents = opened.store.documents.all();
		migrate(opened);
		expect(opened.store.documents.all()).toEqual(documents);
	}
});

it('upgrades an old database that kept content progress with its SQLite migrations', () => {
	const data_dir = temp_dir();
	const db = new DatabaseSync(join(data_dir, 'db.sqlite3'));
	initial_schema.up({ db });
	translations_schema.up({ db });
	db.exec('CREATE TABLE _migrations (id TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)');
	for (const id of [
		'20260803T131059242Z_editable_initial_schema',
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20260923T180000000Z_editable_translations',
		'20261003T120000000Z_editable_code_blocks'
	])
		db.prepare('INSERT INTO _migrations VALUES (?, ?)').run(id, 'then');
	const page = { document_id: 'p1', nodes: { p1: { id: 'p1', type: 'page' } } };
	db.prepare("INSERT INTO documents VALUES ('p1', 'page', ?, 'then', 'then')").run(
		JSON.stringify(page)
	);
	db.close();

	const opened = open_sqlite_folder(data_dir);
	migrate(opened);
	// The banner migration had not run: the site gets its banner, the page refers to it.
	expect(opened.store.documents.get('banner_1')?.type).toBe('banner');
	expect(opened.store.documents.get('p1')?.data.nodes.p1.banner).toBe('banner_1');
	expect(content_applied(opened)).toEqual([
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20261003T120000000Z_editable_code_blocks',
		'20261009T120000000Z_editable_site_banner'
	]);
	expect(opened.migrations.applied()).toContain('20261010T180000000Z_editable_mcp_oauth');
});

it('upgrades a file folder written before settings became records', () => {
	const data_dir = temp_dir();
	const first = open_file_folder(data_dir);
	migrate(first);
	const home_page_id = first.store.settings.get('home_page_id')!.value;
	// What a folder from before format tracking looks like.
	const site = join(data_dir, 'site');
	rmSync(join(site, '_migrations.json'));
	writeFileSync(join(site, 'settings.json'), JSON.stringify({ home_page_id }));

	const reopened = open_file_folder(data_dir);
	migrate(reopened);
	expect(reopened.store.settings.get('home_page_id')).toEqual({
		key: 'home_page_id',
		value: home_page_id
	});
	expect(JSON.parse(readFileSync(join(site, '_migrations.json'), 'utf8')).migrations).toContain(
		'20261016T120000000Z_editable_setting_records_files'
	);
});

it('refuses a backend that misses storage migrations, as a fork adding one would', () => {
	const dir = join(temp_dir(), 'fork');
	mkdirSync(dir);
	const opened = open_file_folder(dir);
	const atproto: OpenedStore = {
		...opened,
		migrations: { ...opened.migrations, target: 'atproto' }
	};
	expect(() => migrate_storage(atproto)).toThrow(
		'20260803T131059242Z_editable_initial_schema_atproto'
	);
	expect(existsSync(join(dir, 'site', '_migrations.json'))).toBe(false);
});

it('refuses data migrated by a newer version', () => {
	const opened = open_file_folder(temp_dir());
	migrate(opened);
	opened.store.settings.put('migrations', {
		key: 'migrations',
		value: JSON.stringify([...content_applied(opened), '29990101T000000000Z_editable_future'])
	});
	expect(() => migrate(opened)).toThrow('29990101T000000000Z_editable_future');
});
