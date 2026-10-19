import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Backend } from '#lib/server/backend.js';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import { all_migrations, migrate } from './migrations.js';
import { backend_for } from './server_backend.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

const dirs: string[] = [];
afterEach(() => {
	vi.restoreAllMocks();
	dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-migrations-'));
	dirs.push(dir);
	return dir;
}

const content_applied = async (backend: Backend) =>
	JSON.parse((await backend.get_setting('migrations')) ?? '[]') as string[];

it('seeds a new site and records every migration as applied', async () => {
	const backend = backend_for(temp_dir());
	await migrate(backend);
	expect(await backend.get_setting('home_page_id')).not.toBeNull();
	expect(await content_applied(backend)).toContain('20261009T120000000Z_editable_site_banner');
	expect(await backend.applied_migrations()).toEqual(
		all_migrations.filter((migration) => migration.target === 'sqlite').map(({ id }) => id)
	);
	// Running again changes nothing.
	const documents = await backend.list_documents();
	await migrate(backend);
	expect(await backend.list_documents()).toEqual(documents);
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

	const backend = backend_for(data_dir);
	await migrate(backend);
	// The banner migration had not run: the site gets its banner, the page refers to it.
	expect((await backend.get_document('banner_1'))?.type).toBe('banner');
	expect((await backend.get_document('p1'))?.data.nodes.p1.banner).toBe('banner_1');
	expect(await content_applied(backend)).toEqual([
		'20260831T211746789Z_custom_rename_prose_grid_layouts',
		'20261003T120000000Z_editable_code_blocks',
		'20261009T120000000Z_editable_site_banner'
	]);
	expect(await backend.applied_migrations()).toContain('20261010T180000000Z_editable_mcp_oauth');
	// The login throttle moved out of the settings.
	expect(await backend.get_login_throttle('admin')).toEqual({
		key: 'admin',
		failed_count: 6,
		locked_until: 99
	});
	expect(await backend.get_setting('login_throttle')).toBeNull();
});

it('refuses data migrated by a newer version', async () => {
	const backend = backend_for(temp_dir());
	await migrate(backend);
	const future = [...(await content_applied(backend)), '29990101T000000000Z_editable_future'];
	await backend.save_documents({
		settings: [{ key: 'migrations', value: JSON.stringify(future) }]
	});
	await expect(migrate(backend)).rejects.toThrow('29990101T000000000Z_editable_future');
});
