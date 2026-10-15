import type { DatabaseSync } from 'node:sqlite';
import type { Collection, SiteStore } from './store.js';

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
		settings: {
			get(key) {
				const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key) as
					{ value: string } | undefined;
				return row?.value ?? null;
			},
			all() {
				return (db.prepare('SELECT value FROM site_settings').all() as { value: string }[]).map(
					(row) => row.value
				);
			},
			put(key, value) {
				db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)').run(
					key,
					value
				);
			},
			delete(key) {
				db.prepare('DELETE FROM site_settings WHERE key = ?').run(key);
			}
		},
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
