import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// The login throttle moves out of the settings into private records of its own.
export default {
	target: 'sqlite',
	up({ db }: SqliteStorage) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS login_throttle (
				key TEXT NOT NULL PRIMARY KEY,
				failed_count INTEGER NOT NULL,
				locked_until INTEGER NOT NULL
			)
		`);
		const setting = db
			.prepare("SELECT value FROM site_settings WHERE key = 'login_throttle'")
			.get() as { value: string } | undefined;
		if (!setting) return;
		const { failed_count, locked_until } = JSON.parse(setting.value);
		db.prepare('INSERT OR REPLACE INTO login_throttle VALUES (?, ?, ?)').run(
			'admin',
			failed_count,
			locked_until
		);
		db.prepare("DELETE FROM site_settings WHERE key = 'login_throttle'").run();
	}
} satisfies Migration;
