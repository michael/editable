import type { Migration } from './migration_registry.js';
import type { DatabaseSync } from 'node:sqlite';
import { plan_pending_migrations } from './migration_plan.js';
import { create_migration_helpers } from './migration_helpers.js';

type Seed = () => unknown;

export default function migrate(
	migrations: Migration[],
	seed: Seed,
	db: DatabaseSync,
	with_transaction: <T>(fn: () => T) => T
) {
	// Invariants — fail before running.
	const migration_ids = migrations.map((migration) => migration.id);
	if (migration_ids.some((id) => typeof id !== 'string' || id.length === 0)) {
		throw new Error('Every migration must have a non-empty string id.');
	}
	if (new Set(migration_ids).size !== migration_ids.length) {
		throw new Error('Migration ids must be unique.');
	}
	if (migrations.some((migration) => typeof migration.up !== 'function')) {
		throw new Error('Every migration must have an up function.');
	}
	if (migrations.some((migration) => migration.up.constructor.name === 'AsyncFunction')) {
		throw new Error('Migration up functions must be synchronous.');
	}

	// Tracker creation, every pending migration, fresh-database seeding, and
	// every tracking record form one atomic operation.
	with_transaction(() => {
		db.exec(`
			CREATE TABLE IF NOT EXISTS _migrations (
				id TEXT PRIMARY KEY NOT NULL,
				timestamp TEXT NOT NULL
			)
		`);

		const applied = new Set(
			(db.prepare('SELECT id FROM _migrations').all() as unknown as Array<{ id: string }>).map(
				(row) => row.id
			)
		);
		const known = new Set(migration_ids);
		const unknown = [...applied].filter((id) => !known.has(id));
		if (unknown.length > 0) {
			throw new Error(
				`Database contains migrations not present in this application: ${unknown.join(', ')}.`
			);
		}

		const helpers = create_migration_helpers(db);
		const remaining_migrations = plan_pending_migrations(migrations, applied);
		const is_fresh_database = applied.size === 0;
		console.log(
			`${applied.size} migrations applied, ${remaining_migrations.length} to be applied...`
		);

		for (const migration of remaining_migrations) {
			console.log('Running migration... ', migration.id);
			try {
				const result = migration.up({ db, ...helpers });
				if (
					result !== null &&
					(typeof result === 'object' || typeof result === 'function') &&
					'then' in result &&
					typeof result.then === 'function'
				) {
					Promise.resolve(result).catch(() => {});
					throw new Error('up returned a Promise; migrations must be synchronous.');
				}
			} catch (error) {
				throw new Error(`Migration "${migration.id}" failed.`, { cause: error });
			}
			db.prepare(
				`
					INSERT INTO _migrations (id, timestamp)
					VALUES (?, ?)
				`
			).run(migration.id, new Date().toISOString());
		}

		if (is_fresh_database) seed();
	});
}
