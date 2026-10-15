import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sqlite_store } from '#lib/server/sqlite_store.js';

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }));
vi.mock('$app/env/private', () => ({ ORIGIN: 'https://example.com', LANGUAGES: '', VERCEL: '' }));
vi.mock('$app/server', () => ({ getRequestEvent: () => ({ locals: request.locals }) }));

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	request.locals = {};
});

it('uses the storage a host sets for the request, and opens the deployment’s own lazily', async () => {
	const data_dir = join(mkdtempSync(join(tmpdir(), 'editable-')), 'data');
	vi.stubEnv('DATA_DIR', data_dir);
	const services = await import('./services.js');
	// Importing opens nothing.
	expect(existsSync(data_dir)).toBe(false);

	const hosted_db = new DatabaseSync(':memory:');
	hosted_db.exec('CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT)');
	const assets = { asset_exists: (asset_id: string) => asset_id === 'hosted.webp' };
	request.locals = {
		site: {
			origin: 'https://host.example',
			base: '/alice',
			languages: [],
			storage: { store: sqlite_store(hosted_db, (fn) => fn()), assets }
		}
	};
	services.with_transaction(() => services.store.settings.put('greeting', 'hosted'));
	expect(hosted_db.prepare('SELECT value FROM site_settings').all()).toEqual([{ value: 'hosted' }]);
	expect(services.asset_exists('hosted.webp')).toBe(true);
	expect(existsSync(data_dir)).toBe(false);

	// Without a host's storage, the deployment's own opens on first use, migrated and seeded.
	request.locals = {};
	expect(services.store.settings.get('greeting')).toBeNull();
	expect(services.store.settings.get('home_page_id')).not.toBeNull();
	expect(existsSync(join(data_dir, 'db.sqlite3'))).toBe(true);
	expect(services.get_storage()).toBe(services.get_default_storage());
	expect(services.asset_exists('hosted.webp')).toBe(false);
});

it('keeps a site in files instead of a database with STORAGE=files', async () => {
	const data_dir = join(mkdtempSync(join(tmpdir(), 'editable-')), 'data');
	vi.stubEnv('DATA_DIR', data_dir);
	vi.stubEnv('STORAGE', 'files');
	const services = await import('./services.js');

	const home_page_id = services.store.settings.get('home_page_id');
	expect(home_page_id).not.toBeNull();
	expect(existsSync(join(data_dir, 'db.sqlite3'))).toBe(false);
	expect(existsSync(join(data_dir, 'site', 'documents', `${home_page_id}.edf`))).toBe(true);

	const home = services.store.documents.get(home_page_id!)!;
	expect(home.type).toBe('page');
	expect(home.data.document_id).toBe(home_page_id);
	expect(
		services.store.documents
			.all()
			.map((record) => record.type)
			.sort()
	).toEqual(['banner', 'footer', 'nav', 'page']);
});
