import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initial_schema from '#lib/server/sqlite_migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from '#lib/server/sqlite_migrations/20260923T180000000Z_editable_translations.js';
import { migrate } from './migrations.js';
import { open_file_folder, open_sqlite_folder } from './storage.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-migrations-'));
	dirs.push(dir);
	return dir;
}

const applied = (store: ReturnType<typeof open_file_folder>) =>
	JSON.parse(store.settings.get('migrations')?.value ?? '[]') as string[];

it('seeds a new store and records every content migration as applied', () => {
	const store = open_file_folder(temp_dir());
	migrate(store);
	expect(store.settings.get('home_page_id')).not.toBeNull();
	expect(applied(store)).toContain('20261009T120000000Z_editable_site_banner');
	// Running again changes nothing.
	const documents = store.documents.all();
	migrate(store);
	expect(store.documents.all()).toEqual(documents);
});

it('moves content migrations out of an old database and applies the ones it missed', () => {
	const data_dir = temp_dir();
	// A database from before the split, upgraded up to the code block migration.
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

	const store = open_sqlite_folder(data_dir);
	expect(applied(store)).toEqual([
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20261003T120000000Z_editable_code_blocks'
	]);

	migrate(store);
	// The banner migration had not run: the site gets its banner, the page refers to it.
	expect(store.documents.get('banner_1')?.type).toBe('banner');
	expect(store.documents.get('p1')?.data.nodes.p1.banner).toBe('banner_1');
	expect(applied(store)).toContain('20261009T120000000Z_editable_site_banner');

	// The database now only tracks its schema; reopening finds nothing to move or run.
	const reopened = open_sqlite_folder(data_dir);
	expect(applied(reopened)).toEqual(applied(store));
});

it('refuses data migrated by a newer version', () => {
	const store = open_file_folder(temp_dir());
	migrate(store);
	store.settings.put('migrations', {
		key: 'migrations',
		value: JSON.stringify([...applied(store), '29990101T000000000Z_editable_future'])
	});
	expect(() => migrate(store)).toThrow('29990101T000000000Z_editable_future');
});
