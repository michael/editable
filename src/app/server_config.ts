export const DATA_DIR = process.env.DATA_DIR || 'data';

/**
 * How many days an unreferenced asset file is kept after losing its last
 * reference. This is also the safe window for rolling back a database backup
 * against the live assets folder.
 */
export const ASSET_GRACE_PERIOD_DAYS = Number(process.env.ASSET_GRACE_PERIOD_DAYS || 7);
