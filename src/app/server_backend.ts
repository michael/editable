import { join } from 'node:path';
import type { Backend } from '#lib/server/backend.js';
import { open_sqlite, sqlite_backend } from '#lib/server/backends/sqlite_backend.js';

/** A data folder's backend: records in db.sqlite3, asset files in assets/. */
export function backend_for(data_dir: string): Backend {
	return sqlite_backend({
		db: open_sqlite(join(data_dir, 'db.sqlite3')),
		asset_dir: join(data_dir, 'assets')
	});
}
