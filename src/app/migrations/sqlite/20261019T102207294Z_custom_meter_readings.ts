import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// The meter readings app keeps its accounts, their sessions, and the readings
// they report next to the site's records, so backups and restores cover them.
// Prefixed, since Editable has a sessions table of its own.
export default {
	up({ db }: SqliteStorage) {
		db.exec(`
			CREATE TABLE meter_accounts (
				username TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('editor', 'reader')),
				password_hash TEXT NOT NULL
			);
			CREATE TABLE meter_sessions (
				session_id TEXT PRIMARY KEY,
				username TEXT NOT NULL REFERENCES meter_accounts (username),
				expires INTEGER NOT NULL
			);
			CREATE TABLE meter_readings (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				username TEXT NOT NULL REFERENCES meter_accounts (username),
				meter TEXT NOT NULL,
				value REAL NOT NULL,
				read_at TEXT NOT NULL
			);
		`);
	}
} satisfies Migration;
