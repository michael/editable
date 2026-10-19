import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
	ConflictError,
	type Backend,
	type DocumentRecord,
	type Expected,
	type LoginThrottleRecord,
	type NewTranslation,
	type OAuthGrantRecord,
	type OAuthTokenRecord,
	type SessionRecord,
	type SettingRecord,
	type SlugRecord,
	type TranslationKey,
	type TranslationRecord
} from '../backend.js';
import { asset_files } from './asset_files.js';

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

type Row = Record<string, unknown>;

/**
 * Records in SQLite and asset files in a folder. node:sqlite is synchronous,
 * so each function runs to its end before another starts, and each write is
 * one SQLite transaction. The storage migrations it has applied are recorded
 * in _migrations; databases from before content progress moved into the
 * settings list their content migrations there as well.
 */
export function sqlite_backend(storage: SqliteStorage): Backend {
	const { db } = storage;
	db.exec(
		'CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY NOT NULL, timestamp TEXT NOT NULL)'
	);

	const one = <T = Row>(sql: string, ...params: SQLInputValue[]) =>
		(db.prepare(sql).get(...params) as T | undefined) ?? null;
	const all = <T = Row>(sql: string, ...params: SQLInputValue[]) =>
		db.prepare(sql).all(...params) as T[];
	const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

	function atomically(work: () => void) {
		db.exec('BEGIN IMMEDIATE');
		try {
			work();
			db.exec('COMMIT');
		} catch (error) {
			db.exec('ROLLBACK');
			throw error;
		}
	}

	const document = (row: Row) =>
		({ ...row, data: JSON.parse(row.data as string) }) as DocumentRecord;
	const slug = (row: Row) => ({ ...row, is_active: row.is_active === 1 }) as SlugRecord;
	const grouped = (rows: Row[], key: string, value: string, field: string) => {
		const groups = new Map<string, string[]>();
		for (const row of rows) {
			const id = row[key] as string;
			if (!groups.has(id)) groups.set(id, []);
			groups.get(id)!.push(row[value] as string);
		}
		return [...groups].map(([document_id, ids]) => ({ document_id, [field]: ids }));
	};

	function assert_version(
		table: string,
		where: string,
		params: SQLInputValue[],
		expected: string | null
	) {
		const current = (one(`SELECT version FROM ${table} WHERE ${where}`, ...params)?.version ??
			null) as string | null;
		if (current !== expected)
			throw new ConflictError(`${params.join(' ')} changed since it was read.`);
	}

	function assert_expected({ documents = {}, translations = [] }: Expected) {
		for (const [document_id, version] of Object.entries(documents))
			assert_version('documents', 'document_id = ?', [document_id], version);
		for (const { document_id, language, version } of translations)
			assert_version(
				'translations',
				'document_id = ? AND language = ?',
				[document_id, language],
				version
			);
	}

	function put_document_refs(document_id: string, target_ids: string[]) {
		run('DELETE FROM document_refs WHERE source_document_id = ?', document_id);
		for (const [ref_order, target_id] of target_ids.entries())
			run(
				'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)',
				target_id,
				document_id,
				ref_order
			);
	}

	function put_asset_refs(document_id: string, asset_ids: string[]) {
		run('DELETE FROM asset_refs WHERE document_id = ?', document_id);
		for (const asset_id of asset_ids)
			run(
				'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)',
				asset_id,
				document_id
			);
	}

	function put_translation(record: NewTranslation) {
		run(
			'INSERT OR REPLACE INTO translations (document_id, language, value, updated_at, version) VALUES (?, ?, ?, ?, ?)',
			record.document_id,
			record.language,
			record.value,
			record.updated_at,
			randomUUID()
		);
	}

	const delete_translation = ({ document_id, language }: TranslationKey) =>
		run('DELETE FROM translations WHERE document_id = ? AND language = ?', document_id, language);

	return {
		name: 'sqlite',
		storage,

		get_document: async (document_id) => {
			const row = one('SELECT * FROM documents WHERE document_id = ?', document_id);
			return row && document(row);
		},
		list_documents: async (type) =>
			(type
				? all('SELECT * FROM documents WHERE type = ? ORDER BY document_id', type)
				: all('SELECT * FROM documents ORDER BY document_id')
			).map(document),
		save_documents: async (save) => {
			const versions: { [document_id: string]: string } = {};
			atomically(() => {
				assert_expected(save.expect ?? {});
				for (const record of save.documents ?? []) {
					versions[record.document_id] = randomUUID();
					run(
						'INSERT OR REPLACE INTO documents (document_id, type, data, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)',
						record.document_id,
						record.type,
						JSON.stringify(record.data),
						record.created_at,
						record.updated_at,
						versions[record.document_id]
					);
				}
				for (const refs of save.document_refs ?? [])
					put_document_refs(refs.document_id, refs.target_ids);
				for (const refs of save.asset_refs ?? []) put_asset_refs(refs.document_id, refs.asset_ids);
				for (const record of save.translations?.put ?? []) put_translation(record);
				for (const key of save.translations?.delete ?? []) delete_translation(key);
				// Inactive slugs first, so a page never has two active ones at a time.
				for (const record of [...(save.slugs ?? [])].sort((a, b) => +a.is_active - +b.is_active)) {
					const owner = one(
						'SELECT document_id, is_active FROM document_slugs WHERE slug = ?',
						record.slug
					);
					if (owner && owner.document_id !== record.document_id && owner.is_active === 1)
						throw new ConflictError(`${record.slug} is another page's slug.`);
					run(
						'INSERT OR REPLACE INTO document_slugs (slug, document_id, is_active, created_at) VALUES (?, ?, ?, ?)',
						record.slug,
						record.document_id,
						record.is_active ? 1 : 0,
						record.created_at
					);
				}
				for (const { key, value } of save.settings ?? [])
					run('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)', key, value);
			});
			return versions;
		},
		delete_page: async (document_id) =>
			atomically(() => {
				run('DELETE FROM documents WHERE document_id = ?', document_id);
				run('DELETE FROM document_slugs WHERE document_id = ?', document_id);
				run('DELETE FROM translations WHERE document_id = ?', document_id);
				run('DELETE FROM asset_refs WHERE document_id = ?', document_id);
				run(
					'DELETE FROM document_refs WHERE source_document_id = ? OR target_document_id = ?',
					document_id,
					document_id
				);
			}),

		resolve_slug: async (slug) => {
			const row = one(
				`SELECT slug.document_id, slug.is_active, active.slug AS active_slug
				FROM document_slugs slug JOIN document_slugs active
				ON active.document_id = slug.document_id AND active.is_active = 1
				WHERE slug.slug = ?`,
				slug
			);
			return (
				row && {
					document_id: row.document_id as string,
					is_active: row.is_active === 1,
					active_slug: row.active_slug as string
				}
			);
		},
		get_active_slug: async (document_id) =>
			(one('SELECT slug FROM document_slugs WHERE document_id = ? AND is_active = 1', document_id)
				?.slug as string | undefined) ?? null,
		list_slugs: async () => all('SELECT * FROM document_slugs').map(slug),

		list_document_refs: async () =>
			grouped(
				all('SELECT source_document_id, target_document_id FROM document_refs ORDER BY ref_order'),
				'source_document_id',
				'target_document_id',
				'target_ids'
			) as { document_id: string; target_ids: string[] }[],
		list_asset_refs: async () =>
			grouped(
				all('SELECT document_id, asset_id FROM asset_refs'),
				'document_id',
				'asset_id',
				'asset_ids'
			) as { document_id: string; asset_ids: string[] }[],

		list_translations: async ({ document_ids, language } = {}) => {
			const where: string[] = [];
			const params: SQLInputValue[] = [];
			if (document_ids) {
				where.push(`document_id IN (${document_ids.map(() => '?').join(', ')})`);
				params.push(...document_ids);
			}
			if (language) {
				where.push('language = ?');
				params.push(language);
			}
			return all<TranslationRecord>(
				`SELECT * FROM translations${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY document_id, language`,
				...params
			);
		},
		save_translations: async (save) =>
			atomically(() => {
				assert_expected(save.expect);
				for (const record of save.put) put_translation(record);
				for (const key of save.delete) delete_translation(key);
				for (const refs of save.asset_refs) put_asset_refs(refs.document_id, refs.asset_ids);
			}),

		get_setting: async (key) =>
			(one('SELECT value FROM site_settings WHERE key = ?', key)?.value as string | undefined) ??
			null,
		list_settings: async () => all<SettingRecord>('SELECT key, value FROM site_settings'),

		get_session: async (session_id) =>
			one<SessionRecord>('SELECT * FROM sessions WHERE session_id = ?', session_id),
		save_session: async ({ session_id, expires }) => {
			run(
				'INSERT OR REPLACE INTO sessions (session_id, expires) VALUES (?, ?)',
				session_id,
				expires
			);
		},
		delete_session: async (session_id) => {
			run('DELETE FROM sessions WHERE session_id = ?', session_id);
		},
		get_login_throttle: async (key) =>
			one<LoginThrottleRecord>('SELECT * FROM login_throttle WHERE key = ?', key),
		save_login_throttle: async ({ key, failed_count, locked_until }) => {
			run(
				'INSERT OR REPLACE INTO login_throttle (key, failed_count, locked_until) VALUES (?, ?, ?)',
				key,
				failed_count,
				locked_until
			);
		},

		get_oauth_grant: async (grant_id) =>
			one<OAuthGrantRecord>('SELECT * FROM oauth_grants WHERE grant_id = ?', grant_id),
		save_oauth_grant: async (grant) => {
			run(
				'INSERT OR REPLACE INTO oauth_grants (grant_id, client_id, redirect_uri, code_challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
				grant.grant_id,
				grant.client_id,
				grant.redirect_uri,
				grant.code_challenge,
				grant.created_at,
				grant.expires_at
			);
		},
		get_oauth_token: async (token_hash) =>
			one<OAuthTokenRecord>('SELECT * FROM oauth_tokens WHERE token_hash = ?', token_hash),
		save_oauth_token: async (token) => {
			run(
				'INSERT OR REPLACE INTO oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, ?, ?)',
				token.token_hash,
				token.grant_id,
				token.kind,
				token.expires_at
			);
		},
		take_oauth_token: async (token_hash) =>
			one<OAuthTokenRecord>(
				'DELETE FROM oauth_tokens WHERE token_hash = ? RETURNING *',
				token_hash
			),
		revoke_oauth_grants: async () =>
			atomically(() => {
				run('DELETE FROM oauth_tokens');
				run('DELETE FROM oauth_grants');
			}),
		delete_expired: async (now) =>
			atomically(() => {
				run('DELETE FROM sessions WHERE expires <= ?', now);
				run('DELETE FROM oauth_grants WHERE expires_at <= ?', now);
				run('DELETE FROM oauth_tokens WHERE expires_at <= ?', now);
			}),

		...asset_files(storage.asset_dir),

		applied_migrations: async () =>
			all('SELECT id FROM _migrations ORDER BY id').map((row) => row.id as string),
		// Storage migrations run at startup, before requests, so awaiting one cannot interleave.
		run_migration: async (id, up) => {
			db.exec('BEGIN IMMEDIATE');
			try {
				await up(storage);
				run('INSERT INTO _migrations (id, timestamp) VALUES (?, ?)', id, new Date().toISOString());
				db.exec('COMMIT');
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		},

		close: async () => db.close()
	};
}
