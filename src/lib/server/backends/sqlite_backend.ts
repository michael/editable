import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Backend, Collection } from '../backend.js';
import { asset_files } from './asset_files.js';
import { one_at_a_time } from './one_at_a_time.js';

/** What sqlite_backend is built on, and what its storage migrations receive. */
export type SqliteStorage = {
	/** The site's database, from open_sqlite. */
	db: DatabaseSync;
	/** The folder asset files are kept in. */
	asset_dir: string;
};

/** Open a SQLite file, creating its folder if needed. */
export function open_sqlite(path: string): DatabaseSync {
	mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode=WAL');
	return db;
}

/**
 * Records in SQLite and asset files in a folder. Each collection is a table
 * its storage migrations create, and a record is a row with its JSON columns
 * parsed. Operations run one at a time on the single connection, so a
 * transaction is a real SQLite transaction. The storage migrations it has
 * applied are recorded in _migrations; databases from before content
 * progress moved into the settings list their content migrations there as
 * well.
 */
export function sqlite_backend(storage: SqliteStorage): Backend {
	const { db } = storage;
	db.exec(
		'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)'
	);

	function collection<R>(
		table: string,
		key: string,
		to_row: (record: R) => Record<string, unknown>,
		from_row: (row: Record<string, unknown>) => R
	): Collection<R> {
		return {
			async get(value) {
				const row = db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(value);
				return row ? from_row(row as Record<string, unknown>) : null;
			},
			async all() {
				return (db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]).map(
					from_row
				);
			},
			async put(record) {
				const row = to_row(record);
				const names = Object.keys(row);
				db.prepare(
					`INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
				).run(...names.map((name) => row[name] as string | number | null));
			},
			async delete(value) {
				db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(value);
			}
		};
	}

	return one_at_a_time(
		{
			name: 'sqlite',
			storage,
			documents: collection(
				'documents',
				'document_id',
				(record) => ({ ...record, data: JSON.stringify(record.data) }),
				(row) => ({ ...(row as any), data: JSON.parse(row.data as string) })
			),
			slugs: collection(
				'document_slugs',
				'slug',
				(record) => ({ ...record, is_active: record.is_active ? 1 : 0 }),
				(row) => ({ ...(row as any), is_active: row.is_active === 1 })
			),
			translations: {
				...collection<any>(
					'translations',
					'rowid',
					(r) => r,
					(r) => r
				),
				async get(key) {
					const [document_id, language] = key.split(':');
					const row = db
						.prepare('SELECT * FROM translations WHERE document_id = ? AND language = ?')
						.get(document_id, language);
					return (row as any) ?? null;
				},
				async put(record) {
					db.prepare(
						'INSERT INTO translations (document_id, language, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(document_id, language) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
					).run(record.document_id, record.language, record.value, record.updated_at);
				},
				async delete(key) {
					const [document_id, language] = key.split(':');
					db.prepare('DELETE FROM translations WHERE document_id = ? AND language = ?').run(
						document_id,
						language
					);
				}
			},
			// One row per link, grouped into a record per source document in link order.
			document_refs: {
				async get(document_id) {
					const rows = db
						.prepare(
							'SELECT target_document_id FROM document_refs WHERE source_document_id = ? ORDER BY ref_order'
						)
						.all(document_id) as { target_document_id: string }[];
					return rows.length
						? { document_id, target_ids: rows.map((row) => row.target_document_id) }
						: null;
				},
				async all() {
					const by_source = new Map<string, string[]>();
					const rows = db
						.prepare(
							'SELECT target_document_id, source_document_id FROM document_refs ORDER BY ref_order'
						)
						.all() as { target_document_id: string; source_document_id: string }[];
					for (const row of rows) {
						if (!by_source.has(row.source_document_id)) by_source.set(row.source_document_id, []);
						by_source.get(row.source_document_id)!.push(row.target_document_id);
					}
					return [...by_source].map(([document_id, target_ids]) => ({ document_id, target_ids }));
				},
				async put({ document_id, target_ids }) {
					db.prepare('DELETE FROM document_refs WHERE source_document_id = ?').run(document_id);
					const insert = db.prepare(
						'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
					);
					for (const [ref_order, target_id] of target_ids.entries())
						insert.run(target_id, document_id, ref_order);
				},
				async delete(document_id) {
					db.prepare('DELETE FROM document_refs WHERE source_document_id = ?').run(document_id);
				}
			},
			// One row per asset and document, grouped into a record per document.
			asset_refs: {
				async get(document_id) {
					const rows = db
						.prepare('SELECT asset_id FROM asset_refs WHERE document_id = ?')
						.all(document_id) as { asset_id: string }[];
					return rows.length ? { document_id, asset_ids: rows.map((row) => row.asset_id) } : null;
				},
				async all() {
					const by_document = new Map<string, string[]>();
					const rows = db.prepare('SELECT asset_id, document_id FROM asset_refs').all() as {
						asset_id: string;
						document_id: string;
					}[];
					for (const row of rows) {
						if (!by_document.has(row.document_id)) by_document.set(row.document_id, []);
						by_document.get(row.document_id)!.push(row.asset_id);
					}
					return [...by_document].map(([document_id, asset_ids]) => ({ document_id, asset_ids }));
				},
				async put({ document_id, asset_ids }) {
					db.prepare('DELETE FROM asset_refs WHERE document_id = ?').run(document_id);
					const insert = db.prepare(
						'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)'
					);
					for (const asset_id of asset_ids) insert.run(asset_id, document_id);
				},
				async delete(document_id) {
					db.prepare('DELETE FROM asset_refs WHERE document_id = ?').run(document_id);
				}
			},
			settings: collection(
				'site_settings',
				'key',
				(r) => r,
				(r) => r as any
			),
			sessions: collection(
				'sessions',
				'session_id',
				(r) => r,
				(r) => r as any
			),
			oauth_clients: collection(
				'oauth_clients',
				'client_id',
				(record) => ({ ...record, redirect_uris: JSON.stringify(record.redirect_uris) }),
				(row) => ({ ...(row as any), redirect_uris: JSON.parse(row.redirect_uris as string) })
			),
			oauth_grants: collection(
				'oauth_grants',
				'grant_id',
				(r) => r,
				(r) => r as any
			),
			oauth_tokens: collection(
				'oauth_tokens',
				'token_hash',
				(r) => r,
				(r) => r as any
			),
			login_throttle: collection(
				'login_throttle',
				'key',
				(r) => r,
				(r) => r as any
			),
			...asset_files(storage.asset_dir),
			delete_expired: async (now) => {
				db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
				db.prepare('DELETE FROM oauth_tokens WHERE expires_at <= ?').run(now);
			},
			applied_migrations: async () =>
				(db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(
					(row) => row.id
				),
			record_migration: async (id) => {
				db.prepare('INSERT INTO _migrations (id, timestamp) VALUES (?, ?)').run(
					id,
					new Date().toISOString()
				);
			},
			close: async () => db.close()
		},
		{
			begin: () => db.exec('BEGIN IMMEDIATE'),
			commit: () => db.exec('COMMIT'),
			rollback: () => db.exec('ROLLBACK')
		}
	);
}
