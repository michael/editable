import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// The login throttle moves out of the settings into private records of its
// own. Recent failed attempts are forgotten.
export default {
	up({ db }: SqliteStorage) {
		db.exec(`
			CREATE TABLE login_throttle (
				key TEXT NOT NULL PRIMARY KEY,
				failed_count INTEGER NOT NULL,
				locked_until INTEGER NOT NULL
			);
			DELETE FROM site_settings WHERE key = 'login_throttle';
		`);
	}
} satisfies Migration;
