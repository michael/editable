import {
	load_migrations,
	migration_context,
	run_migrations,
	type LoadedMigration,
	type Migration
} from '#lib/server/migrations.js';
import type { MigrationDocument } from '#lib/server/migration_helpers.js';
import type { Backend } from '#lib/server/backend.js';
import initial_site from './initial_site.js';
import { document_refs_of } from './server_documents.js';
import { asset_refs_of } from './server_asset_refs.js';

/** Every migration in src/app/migrations, each in its backend's folder, in id order. */
export const all_migrations = load_migrations(
	// Any depth, so a file outside a backend's folder is refused rather than ignored.
	import.meta.glob('./migrations/**/*.ts', { eager: true, import: 'default' }) as Record<
		string,
		Migration
	>
);

const snapshot = (record: MigrationDocument) => JSON.stringify([record.type, record.data]);

/**
 * Run the backend's pending migrations in id order, all as one atomic step,
 * so a failure leaves the site as it was. Each migration gets the backend's
 * storage and the documents as the migrations before it left them, and what
 * it changed in them is written back before the next one runs. A new backend
 * runs its migrations for their storage alone: there is no content to change
 * yet. At the end, the documents the run changed are saved again, which gives
 * them new versions and the references today's code finds in them.
 */
export async function apply_migrations(
	backend: Backend,
	migrations: LoadedMigration[] = all_migrations
) {
	const applied = new Set(await backend.applied_migrations());
	const is_new = !applied.size;
	await backend.migrate(async ({ storage, read_documents, write_documents, record_migration }) => {
		let before: Map<string, string> | undefined;
		const ran = await run_migrations(migrations, backend.name, applied, async (migration) => {
			const documents = is_new ? [] : await read_documents();
			const original = new Map(documents.map((record) => [record.document_id, snapshot(record)]));
			// The first migration's read is the state before the run.
			before ??= original;
			await migration.up(migration_context(storage, documents));
			if (!is_new)
				await write_documents(
					documents.filter((record) => original.get(record.document_id) !== snapshot(record))
				);
			await record_migration(migration.id);
		});
		if (!ran) return;

		const changed = (await backend.list_documents()).filter(
			(record) => before!.get(record.document_id) !== snapshot(record)
		);
		if (!changed.length) return;
		const [slugs, translations] = await Promise.all([
			backend.list_slugs(),
			backend.list_translations({ document_ids: changed.map((record) => record.document_id) })
		]);
		const targets = new Map(slugs.map((record) => [record.slug, record.document_id]));
		await backend.save_documents({
			documents: changed.map(({ version: _, ...record }) => record),
			document_refs: changed.map((record) => document_refs_of(record.data, targets)),
			asset_refs: changed.map((record) =>
				asset_refs_of(
					record.data,
					translations.filter((row) => row.document_id === record.document_id)
				)
			)
		});
	});
}

/** Bring a site up to date: its backend's migrations, then the default site if it has no documents yet. */
export async function migrate(backend: Backend) {
	await apply_migrations(backend);
	// Seeding sets the home page with the documents, so a site that has one is not new.
	if ((await backend.get_setting('home_page_id')) || (await backend.list_documents()).length)
		return;
	await backend.save_documents(initial_site());
}
