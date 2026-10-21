import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	load_migrations,
	migration_context,
	run_migrations,
	type Migration
} from './migrations.js';

afterEach(() => vi.restoreAllMocks());

const up = () => {};
/** Migrations by their path under ./migrations, such as 'sqlite/<id>'. */
const load = (files: Record<string, Migration>) =>
	load_migrations(
		Object.fromEntries(Object.entries(files).map(([path, m]) => [`./migrations/${path}.ts`, m]))
	);

describe('load_migrations', () => {
	it('takes the backend from the folder and orders by id', () => {
		const migrations = load({
			'git/20260102T000000000Z_editable_b': { up },
			'sqlite/20260101T000000000Z_editable_a': { up }
		});
		expect(migrations.map(({ id, backend }) => [id, backend])).toEqual([
			['20260101T000000000Z_editable_a', 'sqlite'],
			['20260102T000000000Z_editable_b', 'git']
		]);
	});

	it('refuses unknown properties, files outside a backend folder, and bad names', () => {
		const one =
			(migration: object, path = 'sqlite/20260101T000000000Z_custom_x') =>
			() =>
				load({ [path]: migration as Migration });
		expect(one({ up, before: ['x'] })).toThrow('unknown export properties: before');
		expect(one({ up, target: 'sqlite' })).toThrow('unknown export properties: target');
		expect(one({ up }, '20260101T000000000Z_custom_x')).toThrow("must be in its backend's folder");
		expect(one({ up }, 'sqlite/old/20260101T000000000Z_custom_x')).toThrow(
			"must be in its backend's folder"
		);
		expect(one({ up }, 'SQLite/20260101T000000000Z_custom_x')).toThrow(
			"must be in its backend's folder"
		);
		expect(one({ up }, 'sqlite/add-things')).toThrow('Invalid migration filename');
	});
});

describe('run_migrations', () => {
	const ran: string[] = [];
	const migrations = load({
		'sqlite/20260101T000000000Z_editable_a': { up: () => ran.push('a') },
		'git/20260102T000000000Z_editable_b': { up: () => ran.push('b') },
		'sqlite/20260103T000000000Z_editable_c': { up: () => ran.push('c') }
	});

	it('runs the pending migrations of one backend in id order and records each', async () => {
		ran.length = 0;
		const recorded: string[] = [];
		const count = await run_migrations(migrations, 'sqlite', new Set(), async ({ id, up }) => {
			await up({});
			recorded.push(id);
		});
		expect(count).toBe(2);
		expect(ran).toEqual(['a', 'c']);
		expect(recorded).toEqual(['20260101T000000000Z_editable_a', '20260103T000000000Z_editable_c']);
	});

	it('warns when a migration runs behind a later one already applied', async () => {
		ran.length = 0;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await run_migrations(
			migrations,
			'sqlite',
			new Set(['20260103T000000000Z_editable_c']),
			async ({ up }) => {
				await up({});
			}
		);
		expect(ran).toEqual(['a']);
		expect(warn.mock.calls[0][0]).toContain('after 20260103T000000000Z_editable_c');
	});

	it('refuses applied ids outside its chain and reports a failing migration', async () => {
		await expect(
			run_migrations(migrations, 'sqlite', new Set(['x']), async () => {})
		).rejects.toThrow('not present in this application: x');
		await expect(
			run_migrations(
				migrations,
				'sqlite',
				new Set(['20260102T000000000Z_editable_b']),
				async () => {}
			)
		).rejects.toThrow('not present in this application: 20260102T000000000Z_editable_b');
		const failing = load({
			'sqlite/20260101T000000000Z_editable_bad': {
				up: () => {
					throw new Error('no');
				}
			}
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await expect(
			run_migrations(failing, 'sqlite', new Set(), async ({ up }) => {
				await up({});
			})
		).rejects.toThrow('Migration "20260101T000000000Z_editable_bad" failed.');
	});
});

describe('migration_context', () => {
	it('spreads the storage next to the documents and helpers', () => {
		const db = {};
		const context = migration_context({ db }, []);
		expect(context.db).toBe(db);
		expect(context.documents).toEqual([]);
		expect(typeof context.rename_type).toBe('function');
	});

	it('refuses storage with a property named like a helper', () => {
		expect(() => migration_context({ db: {}, update: {} }, [])).toThrow(
			'Storage properties clash with migration helpers: update.'
		);
		expect(() => migration_context({ documents: [] }, [])).toThrow('clash');
	});
});
