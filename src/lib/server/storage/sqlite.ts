import type { DatabaseSync } from 'node:sqlite';
import { create_database, type DatabaseConfig } from '../db.js';
import type { Collection, OpenedStore, SiteStore } from './store.js';

/** What migrations with target 'sqlite' receive. */
export type SqliteContext = { db: DatabaseSync };

/**
 * Open a site's SQLite database. The migrations it has applied are recorded
 * in _migrations; databases from before content progress moved into the
 * store list their content migrations there as well.
 */
export function open_sqlite(config: DatabaseConfig): OpenedStore {
	const { db, with_transaction } = create_database(config);
	db.exec(
		'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)'
	);
	const context: SqliteContext = { db };
	return {
		store: sqlite_store(db, with_transaction),
		close: () => db.close(),
		format: {
			target: 'sqlite',
			context,
			applied: () =>
				(db.prepare('SELECT id FROM _migrations ORDER BY id').all() as { id: string }[]).map(
					(row) => row.id
				),
			record: (id) => {
				db.prepare('INSERT INTO _migrations (id, timestamp) VALUES (?, ?)').run(
					id,
					new Date().toISOString()
				);
			},
			transaction: with_transaction
		}
	};
}

/**
 * A site store over the SQLite tables the migrations create. Each collection
 * is one table; a record is a row with JSON columns parsed.
 */
export function sqlite_store(db: DatabaseSync, with_transaction: <T>(fn: () => T) => T): SiteStore {
	function collection<R>(
		table: string,
		key: string,
		to_row: (record: R) => Record<string, unknown>,
		from_row: (row: Record<string, unknown>) => R
	): Collection<R> {
		const columns = (record: R) => Object.keys(to_row(record));
		return {
			get(value) {
				const row = db.prepare(`SELECT * FROM ${table} WHERE ${key} = ?`).get(value);
				return row ? from_row(row as Record<string, unknown>) : null;
			},
			all() {
				return (db.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[]).map(
					from_row
				);
			},
			put(_value, record) {
				const row = to_row(record);
				const names = columns(record);
				db.prepare(
					`INSERT OR REPLACE INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
				).run(...names.map((name) => row[name] as string | number | null));
			},
			delete(value) {
				db.prepare(`DELETE FROM ${table} WHERE ${key} = ?`).run(value);
			}
		};
	}

	return {
		transaction: with_transaction,
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
			get(key) {
				const [document_id, language] = key.split(':');
				const row = db
					.prepare('SELECT * FROM translations WHERE document_id = ? AND language = ?')
					.get(document_id, language);
				return (row as any) ?? null;
			},
			put(_key, record) {
				db.prepare(
					'INSERT INTO translations (document_id, language, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(document_id, language) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
				).run(record.document_id, record.language, record.value, record.updated_at);
			},
			delete(key) {
				const [document_id, language] = key.split(':');
				db.prepare('DELETE FROM translations WHERE document_id = ? AND language = ?').run(
					document_id,
					language
				);
			}
		},
		// One row per link, grouped into a record per source document in link order.
		document_refs: {
			get(document_id) {
				const rows = db
					.prepare(
						'SELECT target_document_id FROM document_refs WHERE source_document_id = ? ORDER BY ref_order'
					)
					.all(document_id) as { target_document_id: string }[];
				return rows.length
					? { document_id, target_ids: rows.map((row) => row.target_document_id) }
					: null;
			},
			all() {
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
			put(document_id, record) {
				db.prepare('DELETE FROM document_refs WHERE source_document_id = ?').run(document_id);
				const insert = db.prepare(
					'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
				);
				for (const [ref_order, target_id] of record.target_ids.entries())
					insert.run(target_id, document_id, ref_order);
			},
			delete(document_id) {
				db.prepare('DELETE FROM document_refs WHERE source_document_id = ?').run(document_id);
			}
		},
		// One row per asset and document, grouped into a record per document.
		asset_refs: {
			get(document_id) {
				const rows = db
					.prepare('SELECT asset_id FROM asset_refs WHERE document_id = ?')
					.all(document_id) as { asset_id: string }[];
				return rows.length ? { document_id, asset_ids: rows.map((row) => row.asset_id) } : null;
			},
			all() {
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
			put(document_id, record) {
				db.prepare('DELETE FROM asset_refs WHERE document_id = ?').run(document_id);
				const insert = db.prepare(
					'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)'
				);
				for (const asset_id of record.asset_ids) insert.run(asset_id, document_id);
			},
			delete(document_id) {
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
		)
	};
}
