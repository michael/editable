import type { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH, ASSET_PATH, ASSET_GRACE_PERIOD_DAYS } from '#app/server_config.js';
import { ASSET_ID_REGEX } from '#app/config.js';
import { create_database } from '#lib/server/db.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';
import { site } from '#app/server_site.js';

/** A site's database and asset files. */
export type SiteStorage = {
	db: DatabaseSync;
	with_transaction: <T>(fn: () => T) => T;
	assets: ReturnType<typeof create_asset_storage>;
};

let default_storage: SiteStorage | undefined;

/** The deployment's own storage in DATA_DIR, opened on first use. */
export function get_default_storage(): SiteStorage {
	if (!default_storage) {
		const { db, with_transaction } = create_database({ data_dir: DATA_DIR, db_path: DB_PATH });
		const assets = create_asset_storage({
			asset_path: ASSET_PATH,
			asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
			asset_id_regex: ASSET_ID_REGEX
		});
		default_storage = { db, with_transaction, assets };
	}
	return default_storage;
}

/** The storage of the current request's site. */
export function get_storage(): SiteStorage {
	return site.storage ?? get_default_storage();
}

/**
 * The current site's database. Each call goes to the storage of the request
 * it runs in, so code imports db once and uses it inside functions; never
 * prepare statements at module level.
 */
export const db = {
	prepare: (sql: string) => get_storage().db.prepare(sql),
	exec: (sql: string) => get_storage().db.exec(sql)
};

export function with_transaction<T>(fn: () => T): T {
	return get_storage().with_transaction(fn);
}

type Assets = SiteStorage['assets'];

/** One of the current site's asset functions. */
function asset_function<K extends keyof Assets>(name: K): Assets[K] {
	return ((...args: unknown[]) =>
		(get_storage().assets[name] as (...args: unknown[]) => unknown)(...args)) as Assets[K];
}

export const write_asset = asset_function('write_asset');
export const write_variant = asset_function('write_variant');
export const write_poster = asset_function('write_poster');
export const asset_exists = asset_function('asset_exists');
export const delete_asset = asset_function('delete_asset');
export const create_asset_read_stream = asset_function('create_asset_read_stream');
export const create_variant_read_stream = asset_function('create_variant_read_stream');
export const create_poster_read_stream = asset_function('create_poster_read_stream');
export const asset_size = asset_function('asset_size');
export const touch_asset = asset_function('touch_asset');
export const delete_orphaned_assets = asset_function('delete_orphaned_assets');
export const asset_path = asset_function('asset_path');
export const variant_path = asset_function('variant_path');
export const poster_path = asset_function('poster_path');
