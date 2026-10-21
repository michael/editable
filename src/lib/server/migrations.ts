import {
	create_migration_helpers,
	type MigrationDocument,
	type MigrationHelpers
} from './migration_helpers.js';

/**
 * A migration file. It lives in its backend's folder, such as
 * src/app/migrations/sqlite, whose files are that backend's chain. Its
 * filename is its permanent id, and a backend runs its chain in id order.
 */
export type Migration = { up: (context: any) => unknown };

/**
 * What a migration receives: its backend's storage, flat, such as `db` for
 * SQLite, next to the site's documents and the helpers that change them.
 */
export type MigrationContext<Storage = unknown> = Storage & {
	documents: MigrationDocument[];
} & MigrationHelpers;

export type LoadedMigration = { id: string; backend: string; up: (context: any) => unknown };

const FILENAME = /^\d{8}T\d{9}Z_[a-z][a-z0-9-]*_[a-z0-9]+(?:_[a-z0-9]+)*\.ts$/;

/** Load migration modules by their paths, such as ./migrations/sqlite/<id>.ts, in id order. */
export function load_migrations(modules: Record<string, Migration>): LoadedMigration[] {
	return Object.entries(modules)
		.map(([path, migration]) => {
			const [backend, filename, ...deeper] = path.split('migrations/').at(-1)!.split('/');
			if (!filename || deeper.length || !/^[a-z][a-z0-9]*$/.test(backend))
				throw new Error(
					`Migration "${path}" must be in its backend's folder, such as src/app/migrations/sqlite.`
				);
			const fail = (problem: string) => new Error(`Migration "${filename}" ${problem}`);
			if (!FILENAME.test(filename)) throw new Error(`Invalid migration filename "${filename}".`);
			if (!migration || typeof migration !== 'object')
				throw fail('must have a default object export.');
			const unknown = Object.keys(migration).filter((key) => key !== 'up');
			if (unknown.length) throw fail(`has unknown export properties: ${unknown.join(', ')}.`);
			if (typeof migration.up !== 'function') throw fail('must have an up function.');
			return { id: filename.slice(0, -'.ts'.length), backend, up: migration.up };
		})
		.sort((left, right) => left.id.localeCompare(right.id));
}

/**
 * Run the migrations of one backend that have not been applied, in id order,
 * through run, which runs one and records it as applied; returns how many
 * ran. Refuses data recording migrations the backend's chain does not have.
 * Warns when a migration runs behind a later one already applied, which
 * happens when migrations arrive out of order.
 */
export async function run_migrations(
	migrations: LoadedMigration[],
	backend: string,
	applied: Set<string>,
	run: (migration: LoadedMigration) => Promise<void>
): Promise<number> {
	const chain = migrations.filter((migration) => migration.backend === backend);
	const known = new Set(chain.map((migration) => migration.id));
	const unknown = [...applied].filter((id) => !known.has(id));
	if (unknown.length)
		throw new Error(
			`Data contains migrations not present in this application: ${unknown.join(', ')}.`
		);

	const pending = chain.filter((migration) => !applied.has(migration.id));
	if (!pending.length) return 0;
	const latest = chain.filter((migration) => applied.has(migration.id)).at(-1)?.id;
	console.log(
		`${chain.length - pending.length} ${backend} migrations applied, ${pending.length} to be applied...`
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
	return pending.length;
}

/**
 * The context a migration's up receives. The storage is spread flat, so a
 * backend whose storage has a property named like a helper is refused rather
 * than having one hide the other.
 */
export function migration_context<Storage extends object>(
	storage: Storage,
	documents: MigrationDocument[]
): MigrationContext<Storage> {
	const content = { documents, ...create_migration_helpers(documents) };
	const clashes = Object.keys(storage).filter((key) => key in content);
	if (clashes.length)
		throw new Error(`Storage properties clash with migration helpers: ${clashes.join(', ')}.`);
	return { ...storage, ...content };
}
