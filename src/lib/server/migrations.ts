import type { MigrationDocument, MigrationHelpers } from './migration_helpers.js';
import type { Backend } from './backend.js';

/**
 * A migration file. Without a target it changes content and runs on every
 * backend. With one, such as 'sqlite' or 'files', it changes that backend's
 * own format and runs only there. Its filename is its permanent id, and
 * migrations run in id order.
 */
export type Migration = { target?: string; up: (context: any) => unknown };

/**
 * What a content migration receives: the site's documents in memory, which
 * the helpers change and Editable saves afterwards, and the backend to read
 * anything else.
 */
export type ContentContext = {
	documents: MigrationDocument[];
	backend: Backend;
} & MigrationHelpers;

export type LoadedMigration = { id: string; target: string; up: (context: any) => unknown };

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
 * Refuse to run a backend that misses a storage change. Every change with a
 * storage migration, whatever its date, needs a file for the backend being
 * opened, an empty one where it needs nothing. Other backends' gaps do not
 * matter here: they surface when those backends run.
 */
export function assert_complete(migrations: LoadedMigration[], target: string) {
	const storage = migrations.filter((migration) => migration.target !== 'content');
	const covered = new Set(
		storage.filter((migration) => migration.target === target).map(change_of)
	);
	const missing = [...new Set(storage.map(change_of))]
		.filter((change) => !covered.has(change))
		.map((change) => `${change}_${target}`);
	if (missing.length)
		throw new Error(
			`Storage migrations are missing for the ${target} backend: ${missing.join(', ')}. Every storage change needs a file for each backend that runs, an empty one where it needs nothing. Add one with pnpm migration:create --join <id> --target ${target}.`
		);
}

/**
 * Run the migrations of one target that have not been applied, in id order,
 * through run, which runs one and records it as applied. Refuses data
 * recording migrations this code does not know. Warns when a migration runs
 * behind a later one already applied, which happens when migrations arrive
 * out of order.
 */
export async function run_migrations(
	migrations: LoadedMigration[],
	target: string,
	applied: Set<string>,
	run: (migration: LoadedMigration) => Promise<void>
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
			await run(migration);
		} catch (error) {
			throw new Error(`Migration "${migration.id}" failed.`, { cause: error });
		}
	}
}
