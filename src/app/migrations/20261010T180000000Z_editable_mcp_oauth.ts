import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// OAuth for the MCP endpoint: time-limited grants, and the codes and tokens
// issued under them (stored as hashes only). Clients are not stored: a
// client_id carries its registration.
export default {
	target: 'sqlite',
	up({ db }: SqliteStorage) {
		db.exec(`
			CREATE TABLE oauth_grants (
				grant_id TEXT NOT NULL PRIMARY KEY,
				client_id TEXT NOT NULL,
				redirect_uri TEXT NOT NULL,
				code_challenge TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				expires_at INTEGER NOT NULL
			);

			CREATE TABLE oauth_tokens (
				token_hash TEXT NOT NULL PRIMARY KEY,
				grant_id TEXT NOT NULL,
				kind TEXT NOT NULL,
				expires_at INTEGER NOT NULL
			);
		`);
	}
} satisfies Migration;
