import {
	assert_complete,
	load_migrations,
	run_migrations,
	type Migration
} from '#lib/server/migrations.js';
import { create_migration_helpers } from '#lib/server/migration_helpers.js';
import type { OpenedStore } from '#lib/server/storage/store.js';
import seed_initial_documents from './seed_initial_documents.js';

const all_migrations = load_migrations(
	import.meta.glob('./migrations/*.ts', { eager: true, import: 'default' }) as Record<
		string,
		Migration
	>
);

/** Bring a backend's own format up to date with the migrations for its target. */
export function migrate_storage({ migrations }: OpenedStore) {
	assert_complete(all_migrations, migrations.target);
	migrations.transaction(() =>
		run_migrations(
			all_migrations,
			migrations.target,
			new Set(migrations.applied()),
			migrations.context,
			(id) => migrations.record(id)
		)
	);
}

/**
 * Bring a site's content up to date, the same way on every backend. A store
 * without documents is new: it gets the default site, which already has the
 * current shape. Otherwise the content migrations it has not run are applied,
 * and their ids are kept in the store's 'migrations' setting.
 */
export function migrate_content({ store, migrations }: OpenedStore) {
	const content_ids = all_migrations
		.filter((migration) => migration.target === 'content')
		.map((migration) => migration.id);
	store.transaction(() => {
		const record = (applied: string[]) =>
			store.settings.put('migrations', { key: 'migrations', value: JSON.stringify(applied) });
		if (!store.documents.all().length) {
			seed_initial_documents(store);
			record(content_ids);
			return;
		}
		const setting = store.settings.get('migrations');
		// SQLite databases from before kept content progress with their own migrations.
		const applied: string[] = setting
			? JSON.parse(setting.value)
			: migrations.applied().filter((id) => content_ids.includes(id));
		run_migrations(
			all_migrations,
			'content',
			new Set(applied),
			{ store, ...create_migration_helpers(store) },
			(id) => {
				applied.push(id);
				record(applied);
			}
		);
	});
}

/** Bring a site up to date: its backend's format first, then its content. */
export function migrate(opened: OpenedStore) {
	migrate_storage(opened);
	migrate_content(opened);
}
