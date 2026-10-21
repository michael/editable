import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { open_sqlite, sqlite_backend } from './sqlite_backend.js';
import { test_backend } from './backend_tests.js';
import { apply_migrations } from '#app/migrations.js';
import type { Backend } from '../backend.js';

// The site's environment; these tests need none of it, so they run without a .env.
vi.mock('$app/env/private', () => ({
	ADMIN_PASSWORD: 'secret',
	NODE_ENV: 'test',
	ORIGIN: 'https://example.com',
	LANGUAGES: 'en',
	VERCEL: ''
}));

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-backend-'));
	dirs.push(dir);
	return dir;
}

async function migrated(backend: Backend) {
	await apply_migrations(backend);
	return backend;
}

const sqlite = () => {
	const dir = temp_dir();
	return migrated(
		sqlite_backend({ db: open_sqlite(join(dir, 'db.sqlite3')), asset_dir: join(dir, 'assets') })
	);
};

test_backend('sqlite', sqlite);

it('rolls a failed SQLite migration run back with everything it did', async () => {
	const backend = await sqlite();
	const { db } = backend.storage as { db: DatabaseSync };
	await expect(
		backend.migrate(async () => {
			db.exec('CREATE TABLE half_done (id TEXT)');
			throw new Error('no');
		})
	).rejects.toThrow('no');
	expect(
		db.prepare("SELECT name FROM sqlite_master WHERE name = 'half_done'").get()
	).toBeUndefined();
});
