import { afterEach, describe, expect, it, vi } from 'vitest';
import { assert_complete, load_migrations, run_migrations, type Migration } from './migrations.js';

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

	it('refuses before, unknown properties, bad targets, bad names, and async up', () => {
		const one =
			(migration: Migration, name = '20260101T000000000Z_custom_x') =>
			() =>
				load({ [name]: migration });
		expect(one({ up, before: ['x'] } as Migration)).toThrow('uses before, which was removed');
		expect(one({ up, after: 'x' } as Migration)).toThrow('unknown export properties: after');
		expect(one({ target: 'SQLite', up })).toThrow('invalid target');
		expect(one({ up }, 'add-things')).toThrow('Invalid migration filename');
		expect(one({ up: async () => {} })).toThrow('must be synchronous');
	});
});

describe('assert_complete', () => {
	const migrations = load({
		'20260101T000000000Z_editable_schema': { target: 'sqlite', up },
		'20260101T000000000Z_editable_schema_files': { target: 'files', up },
		'20260201T000000000Z_editable_content': { up },
		'20260301T000000000Z_editable_redirects_sqlite': { target: 'sqlite', up },
		'20260301T000000000Z_editable_redirects_files': { target: 'files', up }
	});

	it('accepts storage changes that cover every backend', () => {
		expect(() => assert_complete(migrations, 'sqlite')).not.toThrow();
		expect(() => assert_complete(migrations, 'content')).not.toThrow();
	});

	it('names every gap, whatever its date', () => {
		const gap = load({
			'20250101T000000000Z_editable_old_sqlite': { target: 'sqlite', up },
			'20260101T000000000Z_editable_new_sqlite': { target: 'sqlite', up },
			'20260101T000000000Z_editable_new_files': { target: 'files', up }
		});
		expect(() => assert_complete(gap, 'sqlite')).toThrow('20250101T000000000Z_editable_old_files');
	});

	it('catches a misspelled target and a backend without migrations', () => {
		const typo = [
			...migrations,
			...load({ '20260401T000000000Z_editable_x_sqllite': { target: 'sqllite', up } })
		];
		expect(() => assert_complete(typo, 'sqlite')).toThrow('20260401T000000000Z_editable_x_sqlite');
		expect(() => assert_complete(migrations, 'atproto')).toThrow(
			'20260101T000000000Z_editable_schema_atproto, 20260301T000000000Z_editable_redirects_atproto'
		);
	});
});

describe('run_migrations', () => {
	const ran: string[] = [];
	const migrations = load({
		'20260101T000000000Z_editable_a': { up: () => ran.push('a') },
		'20260102T000000000Z_editable_b_sqlite': { target: 'sqlite', up: () => ran.push('b') },
		'20260103T000000000Z_editable_c': { up: () => ran.push('c') }
	});

	it('runs the pending migrations of one target in id order and records each', () => {
		ran.length = 0;
		const recorded: string[] = [];
		run_migrations(migrations, 'content', new Set(), {}, (id) => recorded.push(id));
		expect(ran).toEqual(['a', 'c']);
		expect(recorded).toEqual(['20260101T000000000Z_editable_a', '20260103T000000000Z_editable_c']);
	});

	it('warns when a migration runs behind a later one already applied', () => {
		ran.length = 0;
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		run_migrations(
			migrations,
			'content',
			new Set(['20260103T000000000Z_editable_c']),
			{},
			() => {}
		);
		expect(ran).toEqual(['a']);
		expect(warn.mock.calls[0][0]).toContain('after 20260103T000000000Z_editable_c');
	});

	it('refuses unknown applied ids and reports a failing migration', () => {
		expect(() => run_migrations(migrations, 'content', new Set(['x']), {}, () => {})).toThrow(
			'not present in this application: x'
		);
		const failing = load({
			'20260101T000000000Z_editable_bad': {
				up: () => {
					throw new Error('no');
				}
			}
		});
		vi.spyOn(console, 'log').mockImplementation(() => {});
		expect(() => run_migrations(failing, 'content', new Set(), {}, () => {})).toThrow(
			'Migration "20260101T000000000Z_editable_bad" failed.'
		);
	});
});
