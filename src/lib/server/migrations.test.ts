import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	load_migrations,
	migration_context,
	run_migrations,
	type Migration
} from './migrations.js';

afterEach(() => vi.restoreAllMocks());

const up = () => {};
const load = (files: Record<string, Migration>) =>
	load_migrations(
		Object.fromEntries(Object.entries(files).map(([name, m]) => [`./migrations/${name}.ts`, m]))
	);

describe('load_migrations', () => {
	it('orders by id', () => {
		const migrations = load({
			'20260102T000000000Z_editable_b': { target: 'git', up },
			'20260101T000000000Z_editable_a': { target: 'sqlite', up }
		});
		expect(migrations.map(({ id, target }) => [id, target])).toEqual([
			['20260101T000000000Z_editable_a', 'sqlite'],
			['20260102T000000000Z_editable_b', 'git']
		]);
	});

	it('refuses unknown properties, missing or bad targets, and bad names', () => {
		const one =
			(migration: Migration, name = '20260101T000000000Z_custom_x') =>
			() =>
				load({ [name]: migration });
		const sqlite = (migration: object) => ({ target: 'sqlite', ...migration }) as Migration;
		expect(one(sqlite({ up, before: ['x'] }))).toThrow('unknown export properties: before');
		expect(one(sqlite({ up, after: 'x' }))).toThrow('unknown export properties: after');
		expect(one({ up } as unknown as Migration)).toThrow('needs a target backend');
		expect(one({ target: 'SQLite', up })).toThrow('needs a target backend');
		expect(one(sqlite({ up }), 'add-things')).toThrow('Invalid migration filename');
	});
});

describe('run_migrations', () => {
	const ran: string[] = [];
	const migrations = load({
		'20260101T000000000Z_editable_a': { target: 'sqlite', up: () => ran.push('a') },
		'20260102T000000000Z_editable_b': { target: 'git', up: () => ran.push('b') },
		'20260103T000000000Z_editable_c': { target: 'sqlite', up: () => ran.push('c') }
	});

	it('runs the pending migrations of one target in id order and records each', async () => {
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
			'20260101T000000000Z_editable_bad': {
				target: 'sqlite',
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
