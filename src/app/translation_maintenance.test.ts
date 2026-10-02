import { afterEach, beforeEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	writeFileSync,
	utimesSync,
	statSync,
	rmSync,
	readdirSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';
import { list_translations, purge_translations } from '../../scripts/translation-maintenance.js';

let db: DatabaseSync;
beforeEach(() => {
	db = new DatabaseSync(':memory:');
	initial_schema.up({ db });
	translations_schema.up({ db });
	const original = { nodes: { image: { type: 'image', src: 'original.webp' } } };
	db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
		'page',
		'page',
		JSON.stringify(original)
	);
	for (const language of ['de', 'es']) {
		const map = {
			paragraph: {
				content: {
					nodes: {
						shared: { type: 'image', src: 'shared.webp' },
						unique: { type: 'image', src: `${language}.webp` }
					}
				}
			}
		};
		db.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)').run(
			'page',
			language,
			JSON.stringify(map),
			'now'
		);
	}
	for (const asset_id of ['original.webp', 'shared.webp', 'de.webp', 'es.webp'])
		db.prepare('INSERT INTO asset_refs VALUES (?, ?)').run(asset_id, 'page');
});
afterEach(() => db.close());

it('lists stored languages and purges only the selected language while retaining shared media', () => {
	expect(list_translations(db)).toEqual([
		{ language: 'de', documents: 1 },
		{ language: 'es', documents: 1 }
	]);
	const released: string[] = [];
	expect(purge_translations(db, 'es', (asset_id) => released.push(asset_id))).toBe(1);
	expect(list_translations(db)).toEqual([{ language: 'de', documents: 1 }]);
	expect(db.prepare('SELECT asset_id FROM asset_refs ORDER BY asset_id').all()).toEqual([
		{ asset_id: 'de.webp' },
		{ asset_id: 'original.webp' },
		{ asset_id: 'shared.webp' }
	]);
	expect(released).toEqual(['es.webp']);
	expect(purge_translations(db, 'es')).toBe(0);
	expect(db.prepare('SELECT count(*) AS count FROM documents').get()).toEqual({ count: 1 });
});

it('rolls back the purge and reference changes if remaining translation data is malformed', () => {
	db.prepare('UPDATE translations SET value = ? WHERE language = ?').run('{bad', 'de');
	expect(() => purge_translations(db, 'es')).toThrow();
	expect(list_translations(db)).toHaveLength(2);
	expect(db.prepare('SELECT * FROM asset_refs').all()).toHaveLength(4);
});

it('rolls back when restarting the orphan grace period fails', () => {
	expect(() =>
		purge_translations(db, 'es', () => {
			throw new Error('cannot touch asset');
		})
	).toThrow('cannot touch asset');
	expect(list_translations(db)).toHaveLength(2);
	expect(db.prepare('SELECT * FROM asset_refs').all()).toHaveLength(4);
});

it('rejects invalid tags and lists databases predating translations', () => {
	expect(() => purge_translations(db, '../es')).toThrow();
	db.exec('DROP TABLE translations');
	expect(list_translations(db)).toEqual([]);
});

it('runs the deployed helper against a live WAL database without replacing it or deleting media', () => {
	const directory = mkdtempSync(join(tmpdir(), 'translation-purge-'));
	try {
		const db_path = join(directory, 'db.sqlite3');
		db.prepare('VACUUM INTO ?').run(db_path);
		const live_db = new DatabaseSync(db_path);
		try {
			live_db.exec('PRAGMA journal_mode = WAL');
			mkdirSync(join(directory, 'assets'));
			const asset_path = join(directory, 'assets', 'es.webp');
			writeFileSync(asset_path, 'test asset');
			utimesSync(asset_path, new Date(0), new Date(0));
			const env = { ...process.env, DATA_DIR: directory };
			const before = execFileSync('sh', ['scripts/remote-db.sh', 'translations'], {
				env,
				encoding: 'utf8'
			});
			expect(before).toContain('es: 1 document(s)');
			const result = execFileSync('sh', ['scripts/remote-db.sh', 'purge-translations', 'es'], {
				env,
				encoding: 'utf8'
			});
			expect(result).toContain('OK: purged es translations from 1 document(s)');
			expect(list_translations(live_db)).toEqual([{ language: 'de', documents: 1 }]);
			expect(statSync(asset_path).mtimeMs).toBeGreaterThan(Date.now() - 10000);
		} finally {
			live_db.close();
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});

it('lists and purges a custom local data directory while backing up its unpurged state', () => {
	const directory = mkdtempSync(join(tmpdir(), 'local-translation-purge-'));
	const data_dir = join(directory, 'local data');
	const script_path = resolve('scripts/data.sh');
	try {
		mkdirSync(data_dir);
		const db_path = join(data_dir, 'db.sqlite3');
		db.prepare('VACUUM INTO ?').run(db_path);
		const options = {
			cwd: directory,
			env: {
				...process.env,
				DATA_DIR: data_dir,
				DEPLOY_DRIVER: 'ssh',
				DEPLOY_HOST: 'unused.invalid'
			},
			encoding: 'utf8' as const
		};
		const listing = execFileSync('bash', [script_path, 'translations'], options);
		expect(listing).toContain('Local translations');
		expect(listing).toContain('es: 1 document(s)');
		const result = execFileSync(
			'bash',
			[script_path, 'purge-translations', 'es', '--yes'],
			options
		);
		expect(result).toContain('OK: purged es translations from 1 document(s)');
		const backup_dir = join(directory, 'data-backups');
		const backups = readdirSync(backup_dir);
		expect(backups).toHaveLength(1);
		const backup = new DatabaseSync(join(backup_dir, backups[0]), { readOnly: true });
		const local = new DatabaseSync(db_path, { readOnly: true });
		try {
			expect(list_translations(backup)).toHaveLength(2);
			expect(list_translations(local)).toEqual([{ language: 'de', documents: 1 }]);
		} finally {
			backup.close();
			local.close();
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
