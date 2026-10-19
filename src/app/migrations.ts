import { load_migrations, run_migrations, type Migration } from '#lib/server/migrations.js';
import { create_migration_helpers, type MigrationDocument } from '#lib/server/migration_helpers.js';
import type { Backend } from '#lib/server/backend.js';
import initial_site from './initial_site.js';
import { document_refs_of } from './server_documents.js';
import { asset_refs_of } from './server_asset_refs.js';

/** Every migration in src/app/migrations, in id order. */
export const all_migrations = load_migrations(
	import.meta.glob('./migrations/*.ts', { eager: true, import: 'default' }) as Record<
		string,
		Migration
	>
);

/**
 * Bring a backend's storage up to date with the storage migrations for its
 * name. The backend runs each with its storage and records it in one step.
 */
export async function migrate_storage(backend: Backend) {
	await run_migrations(
		all_migrations,
		backend.name,
		new Set(await backend.applied_migrations()),
		(migration) => backend.run_migration(migration.id, migration.up)
	);
}

/**
 * Bring a site's content up to date, the same way on every backend. A backend
 * without documents is new: it gets the default site, which already has the
 * current shape. Otherwise each content migration it has not run changes the
 * documents in memory, and the changed ones are saved with their references
 * and its id in the 'migrations' setting.
 */
async function migrate_content(backend: Backend) {
	const content_ids = all_migrations
		.filter((migration) => migration.target === 'content')
		.map((migration) => migration.id);
	let documents: MigrationDocument[] = await backend.list_documents();
	if (!documents.length) {
		await backend.save_documents(initial_site(content_ids));
		return;
	}
	const setting = await backend.get_setting('migrations');
	// SQLite databases from before kept content progress with their own migrations.
	const applied: string[] = setting
		? JSON.parse(setting)
		: (await backend.applied_migrations()).filter((id) => content_ids.includes(id));
	await run_migrations(all_migrations, 'content', new Set(applied), async (migration) => {
		const snapshot = (record: { type: string; data: unknown }) =>
			JSON.stringify([record.type, record.data]);
		const before = new Map(documents.map((record) => [record.document_id, snapshot(record)]));
		const working: MigrationDocument[] = structuredClone(documents);
		await migration.up({ documents: working, backend, ...create_migration_helpers(working) });
		const changed = working.filter((record) => before.get(record.document_id) !== snapshot(record));
		applied.push(migration.id);
		// References are recomputed as on every save; the slugs and translations come from this backend.
		const [slugs, translations] = await Promise.all([
			backend.list_slugs(),
			backend.list_translations({ document_ids: changed.map((record) => record.document_id) })
		]);
		const targets = new Map(slugs.map((record) => [record.slug, record.document_id]));
		const versions = await backend.save_documents({
			expect: {
				documents: Object.fromEntries(
					changed.map((record) => [record.document_id, record.version ?? null])
				)
			},
			documents: changed.map(({ version: _, ...record }) => record),
			document_refs: changed.map((record) => document_refs_of(record.data, targets)),
			asset_refs: changed.map((record) =>
				asset_refs_of(
					record.data,
					translations.filter((row) => row.document_id === record.document_id)
				)
			),
			settings: [{ key: 'migrations', value: JSON.stringify(applied) }]
		});
		// Saved documents have new versions, which the next migration expects.
		documents = working.map((record) => ({
			...record,
			version: versions[record.document_id] ?? record.version
		}));
	});
}

/** Bring a site up to date: its backend's storage first, then its content. */
export async function migrate(backend: Backend) {
	await migrate_storage(backend);
	await migrate_content(backend);
}
