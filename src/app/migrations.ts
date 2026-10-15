import { build_migrations } from '#lib/server/migration_registry.js';
import type { Migration, MigrationModule } from '#lib/server/migration_registry.js';
import run_migration_runner from '#lib/server/migration_runner.js';
import seed_initial_documents from './seed_initial_documents.js';
import { get_default_storage, type SiteStorage } from './services.js';

const migration_modules = import.meta.glob('./migrations/*.ts', {
	eager: true,
	import: 'default'
}) as Record<string, MigrationModule>;

const migrations: Migration[] = build_migrations(migration_modules);

/**
 * Bring a site's database up to date: the deployment's own at startup, or a
 * host's site storage when it opens one.
 */
export function run_migrations({ db, with_transaction }: SiteStorage = get_default_storage()) {
	run_migration_runner(migrations, seed_initial_documents, db, with_transaction);
}
