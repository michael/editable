import type { Migration } from '#lib/server/migrations.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

// Documents and translations carry a version that changes with every write,
// so saves can tell when someone else changed them first.
export default {
	target: 'sqlite',
	up({ db }: SqliteStorage) {
		db.exec(`
			ALTER TABLE documents ADD COLUMN version TEXT NOT NULL DEFAULT '';
			ALTER TABLE translations ADD COLUMN version TEXT NOT NULL DEFAULT '';
			UPDATE documents SET version = lower(hex(randomblob(16)));
			UPDATE translations SET version = lower(hex(randomblob(16)));
		`);
	}
} satisfies Migration;
