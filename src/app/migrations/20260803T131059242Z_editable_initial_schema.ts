import type { Migration } from '#lib/server/migrations.js';
import type { SqliteContext } from '#lib/server/storage/sqlite.js';

export default {
	target: 'sqlite',
	up({ db }: SqliteContext) {
		db.exec(`
			CREATE TABLE documents (
				document_id TEXT NOT NULL PRIMARY KEY,
				type TEXT NOT NULL,
				data TEXT,
				created_at TEXT,
				updated_at TEXT
			);

			CREATE TABLE site_settings (
				key TEXT NOT NULL PRIMARY KEY,
				value TEXT
			);

			CREATE TABLE document_refs (
				target_document_id TEXT NOT NULL,
				source_document_id TEXT NOT NULL,
				ref_order INTEGER NOT NULL DEFAULT 0,
				PRIMARY KEY (target_document_id, source_document_id)
			);

			CREATE TABLE asset_refs (
				asset_id TEXT NOT NULL,
				document_id TEXT NOT NULL,
				PRIMARY KEY (asset_id, document_id)
			);

			CREATE TABLE document_slugs (
				slug TEXT NOT NULL PRIMARY KEY,
				document_id TEXT NOT NULL,
				is_active INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);

			CREATE TABLE sessions (
				session_id TEXT NOT NULL PRIMARY KEY,
				expires INTEGER NOT NULL
			);

			CREATE UNIQUE INDEX document_slugs_active_document_id_idx
			ON document_slugs (document_id)
			WHERE is_active = 1;
		`);
	}
} satisfies Migration;
