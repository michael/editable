import { build_migrations, type MigrationModule } from '#lib/server/migration_registry.js';
import { run_pending_migrations } from '#lib/server/migration_runner.js';
import { create_migration_helpers } from '#lib/server/migration_helpers.js';
import type { SiteStore } from '#lib/server/store.js';
import seed_initial_documents from './seed_initial_documents.js';

const migrations = build_migrations(
	import.meta.glob('./migrations/*.ts', { eager: true, import: 'default' }) as Record<
		string,
		MigrationModule
	>
);

/**
 * Bring a site's content up to date on any backend. A store without documents
 * is new: it gets the default site, which already has every migration's shape.
 * Otherwise the content migrations it has not run yet are applied in order,
 * and their ids are kept in the 'migrations' setting.
 */
export function migrate(store: SiteStore) {
	store.transaction(() => {
		const applied: string[] = JSON.parse(store.settings.get('migrations')?.value ?? '[]');
		const record = () =>
			store.settings.put('migrations', { key: 'migrations', value: JSON.stringify(applied) });

		if (!store.documents.all().length) {
			seed_initial_documents(store);
			applied.splice(0, applied.length, ...migrations.map((migration) => migration.id));
			record();
			return;
		}
		run_pending_migrations(
			migrations,
			new Set(applied),
			{ store, ...create_migration_helpers(store) },
			(id) => {
				applied.push(id);
				record();
			}
		);
	});
}
