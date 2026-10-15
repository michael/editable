import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || 'data';
export const DB_PATH = join(DATA_DIR, 'db.sqlite3');
export const ASSET_PATH = join(DATA_DIR, 'assets');

/** Where a site's records live: a SQLite database, or with 'files' a folder of EDF and JSON files. */
export const STORAGE = process.env.STORAGE === 'files' ? 'files' : 'sqlite';

/**
 * How many days an unreferenced asset file is kept after losing its last
 * reference. This is also the safe window for rolling back a database backup
 * against the live assets folder.
 */
export const ASSET_GRACE_PERIOD_DAYS = Number(process.env.ASSET_GRACE_PERIOD_DAYS || 7);
