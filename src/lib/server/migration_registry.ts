import type { MigrationHelpers } from './migration_helpers.js';
import type { SiteStore } from './store.js';

const MIGRATION_FILENAME_PATTERN = /^\d{8}T\d{9}Z_[a-z][a-z0-9-]*_[a-z0-9]+(?:_[a-z0-9]+)*\.ts$/;

/** What a content migration works with: the site's records and the helpers over them. */
export type ContentMigrationContext = { store: SiteStore } & MigrationHelpers;

export type MigrationModule<Context = ContentMigrationContext> = {
	before?: string[];
	up: (context: Context) => unknown;
};
export type Migration<Context = ContentMigrationContext> = MigrationModule<Context> & {
	id: string;
};

export function build_migrations<Context>(
	migration_modules: Record<string, MigrationModule<Context>>
): Migration<Context>[] {
	// Sorting the paths gives timestamp order without a central registry that
	// project migrations must edit.
	return Object.entries(migration_modules)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, migration]) => {
			const filename = path.split('/').at(-1) ?? '';
			if (!MIGRATION_FILENAME_PATTERN.test(filename)) {
				throw new Error(`Invalid migration filename "${filename}".`);
			}

			if (!migration || typeof migration !== 'object') {
				throw new Error(`Migration "${filename}" must have a default object export.`);
			}
			const unknown_keys = Object.keys(migration).filter((key) => !['before', 'up'].includes(key));
			if (unknown_keys.length > 0) {
				throw new Error(
					`Migration "${filename}" has unknown export properties: ${unknown_keys.join(', ')}.`
				);
			}

			return { id: filename.slice(0, -'.ts'.length), ...migration };
		});
}
