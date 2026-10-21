import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import { all_migrations, apply_migrations, migrate } from './migrations.js';
import initial_site from './initial_site.js';
import { backend_for } from './server_backend.js';
import { load_migrations, type MigrationContext } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// The site's environment; these tests need none of it, so they run without a .env.
vi.mock('$app/env/private', () => ({
	ADMIN_PASSWORD: 'secret',
	NODE_ENV: 'test',
	ORIGIN: 'https://example.com',
	LANGUAGES: '',
	VERCEL: ''
}));

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

const sqlite_ids = all_migrations
	.filter((migration) => migration.target === 'sqlite')
	.map(({ id }) => id);

/** Migrations dated after Editable's own, for a chain of a test's making. */
const later = (
	migrations: Record<string, (context: MigrationContext<SqliteStorage>) => unknown>
) => [
	...all_migrations,
	...load_migrations(
		Object.fromEntries(
			Object.entries(migrations).map(([name, up]) => [
				`./migrations/29990101T00000000${name}Z_custom_test.ts`,
				{ target: 'sqlite', up }
			])
		)
	)
];

async function new_site() {
	const backend = backend_for(temp_dir());
	await migrate(backend);
	return { backend, db: (backend.storage as SqliteStorage).db };
}

it('seeds a new site with the default site and records every migration as applied', async () => {
	const { backend } = await new_site();
	expect(await backend.get_setting('home_page_id')).not.toBeNull();
	expect(await backend.applied_migrations()).toEqual(sqlite_ids);
	// A new site's migrations change no content: it starts with the default site as it is.
	expect((await backend.list_documents()).map((record) => record.document_id).sort()).toEqual(
		initial_site()
			.documents!.map((record) => record.document_id)
			.sort()
	);
	// Running again changes nothing.
	const documents = await backend.list_documents();
	await migrate(backend);
	expect(await backend.list_documents()).toEqual(documents);
});

it('upgrades an older database in id order, content and storage alike', async () => {
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
	const page = {
		document_id: 'p1',
		nodes: {
			p1: { id: 'p1', type: 'page', image: 'i1' },
			i1: { id: 'i1', type: 'image', src: 'photo.webp' }
		}
	};
	sqlite
		.prepare("INSERT INTO documents VALUES ('p1', 'page', ?, 'then', 'then')")
		.run(JSON.stringify(page));
	sqlite.close();

	const backend = backend_for(data_dir);
	await migrate(backend);
	// The banner migration ran first, before the documents had versions.
	expect((await backend.get_document('banner_1'))?.type).toBe('banner');
	const p1 = await backend.get_document('p1');
	expect(p1?.data.nodes.p1.banner).toBe('banner_1');
	expect(p1?.version).not.toBe('');
	expect(await backend.applied_migrations()).toEqual(sqlite_ids);
	// What a run changed is saved again at its end, which rebuilds its references.
	expect(await backend.list_asset_refs()).toEqual([
		{ document_id: 'p1', asset_ids: ['photo.webp'] }
	]);
	// The login throttle left the settings for a table of its own, starting over.
	expect(await backend.get_setting('login_throttle')).toBeNull();
	expect(await backend.get_login_throttle('admin')).toBeNull();
});

it('gives each migration the storage and the documents as the ones before it left them', async () => {
	const { backend, db } = await new_site();
	const versions = new Map(
		(await backend.list_documents()).map((record) => [record.document_id, record.version])
	);
	await apply_migrations(
		backend,
		later({
			1: ({ db, update }) => {
				db.exec('CREATE TABLE notes (document_id TEXT NOT NULL)');
				update('page', (node) => {
					node.note = 'migrated';
				});
			},
			2: ({ db }) => {
				db.exec(
					`INSERT INTO notes SELECT document_id FROM documents WHERE data LIKE '%"note":"migrated"%'`
				);
			}
		})
	);
	const pages = await backend.list_documents('page');
	expect(db.prepare('SELECT document_id FROM notes').all()).toEqual(
		pages.map(({ document_id }) => ({ document_id }))
	);
	// Changed documents get new versions; the others keep theirs.
	for (const record of await backend.list_documents())
		expect(record.version === versions.get(record.document_id)).toBe(record.type !== 'page');
});

it('rolls a failing run back as a whole, with what its earlier migrations did', async () => {
	const { backend, db } = await new_site();
	const documents = await backend.list_documents();
	vi.spyOn(console, 'log').mockImplementation(() => {});
	await expect(
		apply_migrations(
			backend,
			later({
				1: ({ db, update }) => {
					db.exec('CREATE TABLE notes (document_id TEXT NOT NULL)');
					update('page', (node) => {
						node.note = 'migrated';
					});
				},
				2: () => {
					throw new Error('no');
				}
			})
		)
	).rejects.toThrow('Migration "29990101T000000002Z_custom_test" failed.');
	expect(await backend.list_documents()).toEqual(documents);
	expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'notes'").get()).toBeUndefined();
	expect(await backend.applied_migrations()).toEqual(sqlite_ids);
});

it('refuses data migrated by a newer version', async () => {
	const { backend, db } = await new_site();
	db.prepare('INSERT INTO _migrations VALUES (?, ?)').run(
		'29990101T000000000Z_editable_future',
		'then'
	);
	await expect(migrate(backend)).rejects.toThrow('29990101T000000000Z_editable_future');
});
