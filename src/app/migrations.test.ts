import { afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Backend } from '#lib/server/backend.js';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import { migrate, migrate_storage } from './migrations.js';
import { backend_in } from './server_backend.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-migrations-'));
	dirs.push(dir);
	return dir;
}

const content_applied = async (backend: Backend) =>
	JSON.parse((await backend.settings.get('migrations'))?.value ?? '[]') as string[];

it('seeds a new site and records every migration as applied, on files and on SQLite', async () => {
	for (const format of ['files', 'sqlite'] as const) {
		const backend = backend_in(temp_dir(), format);
		await migrate(backend);
		expect(await backend.settings.get('home_page_id')).not.toBeNull();
		expect(await content_applied(backend)).toContain('20261009T120000000Z_editable_site_banner');
		expect(await backend.applied_migrations()).toContain(
			`20261016T120000000Z_editable_setting_records_${backend.name}`
		);
		// Running again changes nothing.
		const documents = await backend.documents.all();
		await migrate(backend);
		expect(await backend.documents.all()).toEqual(documents);
	}
});

it('upgrades an old database that kept content progress with its SQLite migrations', async () => {
	const data_dir = temp_dir();
	const sqlite = new DatabaseSync(join(data_dir, 'db.sqlite3'));
	initial_schema.up({ db: sqlite } as SqliteStorage);
	translations_schema.up({ db: sqlite } as SqliteStorage);
	sqlite.exec('CREATE TABLE _migrations (id TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)');
	for (const id of [
		'20260803T131059242Z_editable_initial_schema',
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20260923T180000000Z_editable_translations',
		'20261003T120000000Z_editable_code_blocks'
	])
		sqlite.prepare('INSERT INTO _migrations VALUES (?, ?)').run(id, 'then');
	sqlite
		.prepare("INSERT INTO site_settings VALUES ('login_throttle', ?)")
		.run(JSON.stringify({ failed_count: 6, locked_until: 99 }));
	const page = { document_id: 'p1', nodes: { p1: { id: 'p1', type: 'page' } } };
	sqlite
		.prepare("INSERT INTO documents VALUES ('p1', 'page', ?, 'then', 'then')")
		.run(JSON.stringify(page));
	sqlite.close();

	const backend = backend_in(data_dir, 'sqlite');
	await migrate(backend);
	// The banner migration had not run: the site gets its banner, the page refers to it.
	expect((await backend.documents.get('banner_1'))?.type).toBe('banner');
	expect((await backend.documents.get('p1'))?.data.nodes.p1.banner).toBe('banner_1');
	expect(await content_applied(backend)).toEqual([
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20261003T120000000Z_editable_code_blocks',
		'20261009T120000000Z_editable_site_banner'
	]);
	expect(await backend.applied_migrations()).toContain('20261010T180000000Z_editable_mcp_oauth');
	// The login throttle moved out of the settings.
	expect(await backend.login_throttle.get('admin')).toEqual({
		key: 'admin',
		failed_count: 6,
		locked_until: 99
	});
	expect(await backend.settings.get('login_throttle')).toBeNull();
});

it('upgrades a file folder written before settings became records', async () => {
	const data_dir = temp_dir();
	const first = backend_in(data_dir, 'files');
	await migrate(first);
	const home_page_id = (await first.settings.get('home_page_id'))!.value;
	// What a folder from before format tracking looks like.
	const site = join(data_dir, 'site');
	rmSync(join(site, '_migrations.json'));
	writeFileSync(join(site, 'settings.json'), JSON.stringify({ home_page_id }));

	const reopened = backend_in(data_dir, 'files');
	await migrate(reopened);
	expect(await reopened.settings.get('home_page_id')).toEqual({
		key: 'home_page_id',
		value: home_page_id
	});
	expect(JSON.parse(readFileSync(join(site, '_migrations.json'), 'utf8')).migrations).toContain(
		'20261016T120000000Z_editable_setting_records_files'
	);
});

it('refuses a backend that misses storage migrations, as a fork adding one would', async () => {
	const dir = join(temp_dir(), 'fork');
	mkdirSync(dir);
	const atproto: Backend = { ...backend_in(dir, 'files'), name: 'atproto' };
	await expect(migrate_storage(atproto)).rejects.toThrow(
		'20260803T131059242Z_editable_initial_schema_atproto'
	);
	expect(existsSync(join(dir, 'site', '_migrations.json'))).toBe(false);
});

it('refuses data migrated by a newer version', async () => {
	const backend = backend_in(temp_dir(), 'files');
	await migrate(backend);
	await backend.settings.put({
		key: 'migrations',
		value: JSON.stringify([
			...(await content_applied(backend)),
			'29990101T000000000Z_editable_future'
		])
	});
	await expect(migrate(backend)).rejects.toThrow('29990101T000000000Z_editable_future');
});
