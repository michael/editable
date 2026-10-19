import { afterEach, describe, expect, it, vi } from 'vitest';
import { load_migrations, run_migrations, type Migration } from './migrations.js';

afterEach(() => vi.restoreAllMocks());

const up = () => {};
const load = (files: Record<string, Migration>) =>
	load_migrations(
		Object.fromEntries(Object.entries(files).map(([name, m]) => [`./migrations/${name}.ts`, m]))
	);

describe('load_migrations', () => {
	it('orders by id and defaults the target to content', () => {
		const migrations = load({
			'20260102T000000000Z_editable_b': { up },
			'20260101T000000000Z_editable_a_sqlite': { target: 'sqlite', up }
		});
		expect(migrations.map(({ id, target }) => [id, target])).toEqual([
			['20260101T000000000Z_editable_a_sqlite', 'sqlite'],
			['20260102T000000000Z_editable_b', 'content']
		]);
	});

	it('refuses unknown properties, bad targets, and bad names', () => {
		const one =
			(migration: Migration, name = '20260101T000000000Z_custom_x') =>
			() =>
				load({ [name]: migration });
		expect(one({ up, before: ['x'] } as Migration)).toThrow('unknown export properties: before');
		expect(one({ up, after: 'x' } as Migration)).toThrow('unknown export properties: after');
		expect(one({ target: 'SQLite', up })).toThrow('invalid target');
		expect(one({ up }, 'add-things')).toThrow('Invalid migration filename');
	});
});

describe('run_migrations', () => {
	const ran: string[] = [];
	const migrations = load({
		'20260101T000000000Z_editable_a': { up: () => ran.push('a') },
		'20260102T000000000Z_editable_b_sqlite': { target: 'sqlite', up: () => ran.push('b') },
		'20260103T000000000Z_editable_c': { up: () => ran.push('c') }
	});

	it('runs the pending migrations of one target in id order and records each', async () => {
		ran.length = 0;
		const recorded: string[] = [];
		await run_migrations(migrations, 'content', new Set(), async ({ id, up }) => {
			await up({});
			recorded.push(id);
		});
		expect(ran).toEqual(['a', 'c']);
		expect(recorded).toEqual(['20260101T000000000Z_editable_a', '20260103T000000000Z_editable_c']);
	});

	it('warns when a migration runs behind a later one already applied', async () => {
		ran.length = 0;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await run_migrations(
			migrations,
			'content',
			new Set(['20260103T000000000Z_editable_c']),
			async ({ up }) => {
				await up({});
			}
		);
		expect(ran).toEqual(['a']);
		expect(warn.mock.calls[0][0]).toContain('after 20260103T000000000Z_editable_c');
	});

	it('refuses unknown applied ids and reports a failing migration', async () => {
		await expect(
			run_migrations(migrations, 'content', new Set(['x']), async () => {})
		).rejects.toThrow('not present in this application: x');
		const failing = load({
			'20260101T000000000Z_editable_bad': {
				up: () => {
					throw new Error('no');
				}
			}
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		await expect(
			run_migrations(failing, 'content', new Set(), async ({ up }) => {
				await up({});
			})
		).rejects.toThrow('Migration "20260101T000000000Z_editable_bad" failed.');
	});
});
