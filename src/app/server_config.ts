import { join } from 'node:path';

export const DATA_DIR = process.env.DATA_DIR || 'data';
export const DB_PATH = join(DATA_DIR, 'db.sqlite3');
export const ASSET_PATH = join(DATA_DIR, 'assets');

/**
 * The backend for a new data folder: 'sqlite' (the default) or 'files'. An
 * existing folder keeps the format it holds; pnpm data:convert changes it.
 */
export const STORAGE = process.env.STORAGE ?? '';

/**
 * How many days an unreferenced asset file is kept after losing its last
 * reference. This is also the safe window for rolling back a database backup
 * against the live assets folder.
 */
export const ASSET_GRACE_PERIOD_DAYS = Number(process.env.ASSET_GRACE_PERIOD_DAYS || 7);
