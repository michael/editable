import { afterEach, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bucket = vi.hoisted(() => ({
	list_keys: vi.fn(),
	get_object: vi.fn()
}));
vi.mock('../lib/server/s3.ts', () => ({ s3_enabled: () => true, ...bucket }));

let dir: string;
afterEach(async () => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	vi.clearAllMocks();
	if (dir) await rm(dir, { recursive: true, force: true });
});

it.each([false, true])(
	'restores referenced originals and derivatives (legacy database: %s)',
	async (legacy) => {
		dir = await mkdtemp(join(tmpdir(), 'restore-assets-'));
		const db_path = join(dir, 'db.sqlite3');
		const db = new DatabaseSync(db_path);
		const original = `${'a'.repeat(64)}.webp`;
		const translated = `${'b'.repeat(64)}.mp4`;
		const variant = `${'a'.repeat(64)}/w320.webp`;
		const poster = `${'b'.repeat(64)}/poster.webp`;
		try {
			db.exec('CREATE TABLE documents (data TEXT)');
			db.prepare('INSERT INTO documents VALUES (?)').run(
				JSON.stringify({ nodes: { image: { type: 'image', src: original } } })
			);
			if (!legacy) {
				db.exec('CREATE TABLE translations (value TEXT)');
				db.prepare('INSERT INTO translations VALUES (?)').run(
					JSON.stringify({ nodes: { video: { type: 'video', src: translated } } })
				);
			}
		} finally {
			db.close();
		}
		await mkdir(join(dir, 'assets'));
		await writeFile(join(dir, 'assets', original), 'existing original');
		bucket.list_keys.mockResolvedValue(
			[original, variant, translated, poster, 'unreferenced.webp'].map((key) => `assets/${key}`)
		);
		bucket.get_object.mockImplementation(async (key) => Buffer.from(key));
		vi.stubEnv('DATA_DIR', dir);
		vi.spyOn(process, 'argv', 'get').mockReturnValue([
			process.execPath,
			'restore-assets.js',
			db_path
		]);
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.resetModules();
		await import('../../scripts/restore-assets.js');
		expect(await readFile(join(dir, 'assets', original), 'utf8')).toBe('existing original');
		expect(await readFile(join(dir, 'assets', variant), 'utf8')).toBe(`assets/${variant}`);
		expect(existsSync(join(dir, 'assets', translated))).toBe(!legacy);
		expect(existsSync(join(dir, 'assets', poster))).toBe(!legacy);
		expect(existsSync(join(dir, 'assets', 'unreferenced.webp'))).toBe(false);
		expect(bucket.get_object.mock.calls.map(([key]) => key)).toEqual(
			(legacy ? [variant] : [variant, translated, poster]).map((key) => `assets/${key}`)
		);
	}
);
