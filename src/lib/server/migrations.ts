import type { MigrationHelpers } from './migration_helpers.js';
import type { Database } from './storage/database.js';

/**
 * A migration file. Without a target it changes content and runs on every
 * backend. With one, such as 'sqlite' or 'files', it changes that backend's
 * own format and runs only there. Its filename is its permanent id, and
 * migrations run in id order.
 */
export type Migration = { target?: string; up: (context: any) => unknown };

/** What a content migration receives. */
export type ContentContext = { db: Database } & MigrationHelpers;

export type LoadedMigration = { id: string; target: string; up: (context: unknown) => unknown };

const FILENAME = /^\d{8}T\d{9}Z_[a-z][a-z0-9-]*_[a-z0-9]+(?:_[a-z0-9]+)*\.ts$/;

export function load_migrations(modules: Record<string, Migration>): LoadedMigration[] {
	return Object.entries(modules)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, migration]) => {
			const filename = path.split('/').at(-1) ?? '';
			const fail = (problem: string) => new Error(`Migration "${filename}" ${problem}`);
			if (!FILENAME.test(filename)) throw new Error(`Invalid migration filename "${filename}".`);
			if (!migration || typeof migration !== 'object')
				throw fail('must have a default object export.');
			if ('before' in migration)
				throw fail(
					'uses before, which was removed: migrations run in id order. Date it to sit where it must run; pnpm migration:create --after <id> places a new one right after another.'
				);
			const unknown = Object.keys(migration).filter((key) => !['target', 'up'].includes(key));
			if (unknown.length) throw fail(`has unknown export properties: ${unknown.join(', ')}.`);
			if (migration.target !== undefined && !/^[a-z][a-z0-9]*$/.test(migration.target))
				throw fail(`has an invalid target "${migration.target}".`);
			if (typeof migration.up !== 'function') throw fail('must have an up function.');
			if (migration.up.constructor.name === 'AsyncFunction') throw fail('must be synchronous.');
			return {
				id: filename.slice(0, -'.ts'.length),
				target: migration.target ?? 'content',
				up: migration.up
			};
		});
}

/** The change a storage migration belongs to: its id without its target's suffix. */
const change_of = ({ id, target }: LoadedMigration) =>
	id.endsWith(`_${target}`) ? id.slice(0, -target.length - 1) : id;

/**
 * Refuse storage changes that skip a backend. Every change with a storage
 * migration needs one for every storage target, whatever its date, so a
 * backend can never miss a change. The targets are those the migrations
 * name, plus the one being opened.
 */
export function assert_complete(migrations: LoadedMigration[], opened_target: string) {
	const storage = migrations.filter((migration) => migration.target !== 'content');
	const targets = new Set(storage.map((migration) => migration.target));
	if (opened_target !== 'content') targets.add(opened_target);
	const covered = new Map<string, Set<string>>();
	for (const migration of storage) {
		const change = change_of(migration);
		if (!covered.has(change)) covered.set(change, new Set());
		covered.get(change)!.add(migration.target);
	}
	const missing = [...covered].flatMap(([change, has]) =>
		[...targets].filter((target) => !has.has(target)).map((target) => `${change}_${target}`)
	);
	if (missing.length)
		throw new Error(
			`Storage migrations are missing: ${missing.join(', ')}. Every storage change needs a migration for every backend, an empty one where it needs nothing.`
		);
}

/**
 * Run the migrations of one target that have not been applied, in id order,
 * recording each as it completes. Refuses data recording migrations this
 * code does not know. Warns when a migration runs behind a later one already
 * applied, which happens when migrations arrive out of order.
 */
export function run_migrations(
	migrations: LoadedMigration[],
	target: string,
	applied: Set<string>,
	context: unknown,
	record: (id: string) => void
) {
	const known = new Set(migrations.map((migration) => migration.id));
	const unknown = [...applied].filter((id) => !known.has(id));
	if (unknown.length)
		throw new Error(
			`Data contains migrations not present in this application: ${unknown.join(', ')}.`
		);

	const of_target = migrations.filter((migration) => migration.target === target);
	const pending = of_target.filter((migration) => !applied.has(migration.id));
	if (!pending.length) return;
	const latest = of_target.filter((migration) => applied.has(migration.id)).at(-1)?.id;
	console.log(
		`${of_target.length - pending.length} ${target} migrations applied, ${pending.length} to be applied...`
	);

	for (const migration of pending) {
		if (latest && migration.id < latest)
			console.warn(`Running migration ${migration.id} after ${latest}, which was applied first.`);
		console.log('Running migration... ', migration.id);
		try {
			const result = migration.up(context);
			if (result && typeof (result as Promise<unknown>).then === 'function') {
				(result as Promise<unknown>).catch(() => {});
				throw new Error('up returned a Promise; migrations must be synchronous.');
			}
		} catch (error) {
			throw new Error(`Migration "${migration.id}" failed.`, { cause: error });
		}
		record(migration.id);
	}
}
