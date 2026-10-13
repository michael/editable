import type { MigrationModule } from '#lib/server/migration_registry.js';

// OAuth for the MCP endpoint: registered clients, time-limited grants, and the
// codes and tokens issued under them (stored as hashes only).
export default {
	up({ db }) {
		db.exec(`
			CREATE TABLE oauth_clients (
				client_id TEXT NOT NULL PRIMARY KEY,
				client_name TEXT,
				redirect_uris TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);

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
} satisfies MigrationModule;
