import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

export default {
	up({ db }: SqliteStorage) {
		db.exec(`
			CREATE TABLE translations (
				document_id TEXT NOT NULL,
				language TEXT NOT NULL,
				-- Sparse map: { node_id: { property_id: payload } }.
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (document_id, language)
			);
		`);
	}
} satisfies Migration;
