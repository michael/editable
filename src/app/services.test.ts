import { expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }));
vi.mock('$app/env/private', () => ({ ORIGIN: 'https://example.com', LANGUAGES: '', VERCEL: '' }));
vi.mock('$app/server', () => ({ getRequestEvent: () => ({ locals: request.locals }) }));

it('uses the storage a host sets for the request, and opens the deployment’s own lazily', async () => {
	const data_dir = join(mkdtempSync(join(tmpdir(), 'editable-')), 'data');
	vi.stubEnv('DATA_DIR', data_dir);
	const services = await import('./services.js');
	// Importing opens nothing.
	expect(existsSync(data_dir)).toBe(false);

	const hosted_db = new DatabaseSync(':memory:');
	const assets = { asset_exists: (asset_id: string) => asset_id === 'hosted.webp' };
	request.locals = {
		site: {
			origin: 'https://host.example',
			base: '/alice',
			languages: [],
			storage: { db: hosted_db, with_transaction: <T>(fn: () => T) => fn(), assets }
		}
	};
	services.db.exec('CREATE TABLE t (v TEXT)');
	services.with_transaction(() => services.db.prepare('INSERT INTO t VALUES (?)').run('hosted'));
	expect(hosted_db.prepare('SELECT v FROM t').all()).toEqual([{ v: 'hosted' }]);
	expect(services.asset_exists('hosted.webp')).toBe(true);
	expect(existsSync(data_dir)).toBe(false);

	// Without a host's storage, the deployment's own opens on first use.
	request.locals = {};
	expect(services.db.prepare('SELECT count(*) AS n FROM sqlite_master').get()).toEqual({ n: 0 });
	expect(existsSync(join(data_dir, 'db.sqlite3'))).toBe(true);
	expect(services.get_storage()).toBe(services.get_default_storage());
	expect(services.asset_exists('hosted.webp')).toBe(false);
	vi.unstubAllEnvs();
});
