import {
	assert_complete,
	load_migrations,
	run_migrations,
	type Migration
} from '#lib/server/migrations.js';
import { create_migration_helpers } from '#lib/server/migration_helpers.js';
import type { Backend } from '#lib/server/backend.js';
import seed_initial_documents from './seed_initial_documents.js';

const all_migrations = load_migrations(
	import.meta.glob('./migrations/*.ts', { eager: true, import: 'default' }) as Record<
		string,
		Migration
	>
);

/** What a migration run may tolerate. */
export type MigrateOptions = {
	/** Warn about storage changes without a file for this backend instead of refusing them. */
	allow_missing_migrations?: boolean;
};

/** Bring a backend's storage up to date with the storage migrations for its name. */
export async function migrate_storage(backend: Backend, options: MigrateOptions = {}) {
	assert_complete(all_migrations, backend.name, {
		allow_missing: options.allow_missing_migrations
	});
	await backend.transaction(async (tx) =>
		run_migrations(
			all_migrations,
			backend.name,
			new Set(await tx.applied_migrations()),
			backend.storage,
			(id) => tx.record_migration(id)
		)
	);
}

/**
 * Bring a site's content up to date, the same way on every backend. A backend
 * without documents is new: it gets the default site, which already has the
 * current shape. Otherwise the content migrations it has not run are applied,
 * and their ids are kept in the 'migrations' setting.
 */
export async function migrate_content(backend: Backend) {
	const content_ids = all_migrations
		.filter((migration) => migration.target === 'content')
		.map((migration) => migration.id);
	await backend.transaction(async (tx) => {
		const record = (applied: string[]) =>
			tx.settings.put({ key: 'migrations', value: JSON.stringify(applied) });
		if (!(await tx.documents.all()).length) {
			await seed_initial_documents(tx);
			await record(content_ids);
			return;
		}
		const setting = await tx.settings.get('migrations');
		// SQLite databases from before kept content progress with their own migrations.
		const applied: string[] = setting
			? JSON.parse(setting.value)
			: (await tx.applied_migrations()).filter((id) => content_ids.includes(id));
		await run_migrations(
			all_migrations,
			'content',
			new Set(applied),
			{ backend: tx, ...create_migration_helpers(tx) },
			(id) => {
				applied.push(id);
				return record(applied);
			}
		);
	});
}

/** Bring a site up to date: its backend's storage first, then its content. */
export async function migrate(backend: Backend, options: MigrateOptions = {}) {
	await migrate_storage(backend, options);
	await migrate_content(backend);
}
