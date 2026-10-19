import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqlite_backend } from '#lib/server/backends/sqlite_backend.js';

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }));
vi.mock('$app/env/private', () => ({ ORIGIN: 'https://example.com', LANGUAGES: '', VERCEL: '' }));
vi.mock('$app/server', () => ({ getRequestEvent: () => ({ locals: request.locals }) }));

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	request.locals = {};
});

it('uses the backend a host sets for the request, and opens the deployment’s own lazily', async () => {
	const data_dir = join(mkdtempSync(join(tmpdir(), 'editable-')), 'data');
	vi.stubEnv('DATA_DIR', data_dir);
	const services = await import('./services.js');
	// Importing opens nothing.
	expect(existsSync(data_dir)).toBe(false);

	const hosted_db = new DatabaseSync(':memory:');
	hosted_db.exec('CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT)');
	const hosted = sqlite_backend({
		db: hosted_db,
		asset_dir: mkdtempSync(join(tmpdir(), 'editable-hosted-assets-'))
	});
	await hosted.write_asset('hosted.webp', new TextEncoder().encode('image'));
	request.locals = {
		site: { origin: 'https://host.example', base: '/alice', languages: [], backend: hosted }
	};
	await services.backend.save_documents({ settings: [{ key: 'greeting', value: 'hosted' }] });
	expect(hosted_db.prepare('SELECT value FROM site_settings').all()).toEqual([{ value: 'hosted' }]);
	expect(await services.asset_exists('hosted.webp')).toBe(true);
	expect(existsSync(data_dir)).toBe(false);

	// Without a host's backend, the deployment's own opens on first use, migrated and seeded.
	request.locals = {};
	expect(await services.backend.get_setting('greeting')).toBeNull();
	expect(await services.backend.get_setting('home_page_id')).not.toBeNull();
	expect(existsSync(join(data_dir, 'db.sqlite3'))).toBe(true);
	expect(await services.get_backend()).toBe(await services.get_default_backend());
	expect(await services.asset_exists('hosted.webp')).toBe(false);
});
