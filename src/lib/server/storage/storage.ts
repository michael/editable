import type { Assets } from './assets.js';
import type { Database } from './database.js';

/**
 * Where Editable keeps a site: its database, holding documents, settings,
 * and every other record, and its assets, the uploaded files. Each part has
 * backends in backends/: the database in SQLite or in files, the assets in
 * a folder.
 */
export type Storage = { db: Database; assets: Assets };
