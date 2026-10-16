import type { Migration } from './migration_registry.js';
import { plan_pending_migrations } from './migration_plan.js';

/**
 * Run the migrations not yet applied, in planned order, recording each one as
 * it completes. The caller runs this inside a transaction where the backend
 * has one, so the whole upgrade succeeds or nothing changes.
 */
export function run_pending_migrations<Context>(
	migrations: Migration<Context>[],
	applied: Set<string>,
	context: Context,
	record: (id: string) => void
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

	const known = new Set(migration_ids);
	const unknown = [...applied].filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new Error(
			`Data contains migrations not present in this application: ${unknown.join(', ')}.`
		);
	}

	const pending = plan_pending_migrations(migrations, applied);
	if (pending.length)
		console.log(`${applied.size} migrations applied, ${pending.length} to be applied...`);

	for (const migration of pending) {
		console.log('Running migration... ', migration.id);
		try {
			const result = migration.up(context);
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
		record(migration.id);
	}
}
