import { expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile, utimes, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { referenced_assets } from '../../scripts/asset-references.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';
import { ASSET_ID_REGEX } from './config.js';

vi.mock('#lib/server/s3.js', () => ({ mirror_file: vi.fn() }));

it('verification finds translation-only assets and cleanup respects references and the grace period', async () => {
	const dir = await mkdtemp(join(tmpdir(), 'translation-assets-'));
	const db_path = join(dir, 'test.sqlite3');
	const db = new DatabaseSync(db_path);
	const asset_id = `${'d'.repeat(64)}.webp`;
	const file = join(dir, asset_id);
	try {
		db.exec('CREATE TABLE documents (data TEXT); CREATE TABLE translations (value TEXT)');
		db.prepare('INSERT INTO translations VALUES (?)').run(
			JSON.stringify({
				node_id: 'media',
				nodes: { media: { id: 'media', type: 'image', src: asset_id } }
			})
		);
		expect(referenced_assets(db)).toEqual(new Set([asset_id]));
		const missing = spawnSync(process.execPath, ['scripts/check-assets.js', db_path, dir], {
			encoding: 'utf8'
		});
		expect(missing.status).toBe(1);
		expect(missing.stderr).toContain(asset_id);
		await writeFile(file, 'original');
		const variants = join(dir, 'd'.repeat(64));
		await mkdir(variants);
		await writeFile(join(variants, 'poster.webp'), 'poster');
		await writeFile(join(variants, 'w320.webp'), 'variant');
		const old = new Date(Date.now() - 3 * 86400000);
		await utimes(file, old, old);
		const storage = create_asset_storage({
			asset_path: dir,
			asset_grace_period_days: 1,
			asset_id_regex: ASSET_ID_REGEX
		});
		expect(await storage.delete_orphaned_assets(referenced_assets(db))).toBe(0);
		const present = spawnSync(process.execPath, ['scripts/check-assets.js', db_path, dir], {
			encoding: 'utf8'
		});
		expect(present.status).toBe(0);
		db.exec('DELETE FROM translations');
		await storage.touch_asset(asset_id);
		expect(await storage.delete_orphaned_assets(referenced_assets(db))).toBe(0);
		await utimes(file, old, old);
		expect(await storage.delete_orphaned_assets(referenced_assets(db))).toBe(1);
		expect(existsSync(file)).toBe(false);
		expect(existsSync(variants)).toBe(false);
		// Backups predating the translations table still work.
		db.exec('DROP TABLE translations');
		expect(referenced_assets(db)).toEqual(new Set());
	} finally {
		db.close();
		await rm(dir, { recursive: true, force: true });
	}
});
