import { DATA_DIR, STORAGE } from '#app/server_config.js';
import type { Assets } from '#lib/server/storage/assets.js';
import type { Database } from '#lib/server/storage/database.js';
import type { Storage } from '#lib/server/storage/storage.js';
import { migrate } from '#app/migrations.js';
import { storage_for } from '#app/storage.js';
import { site } from '#app/server_site.js';

let default_storage: Storage | undefined;

/**
 * The deployment's own storage in DATA_DIR, opened on first use and brought
 * up to date, in the format the folder holds: a SQLite database, or a folder
 * of EDF documents and JSON records.
 */
export function get_default_storage(): Storage {
	if (!default_storage) {
		default_storage = storage_for(DATA_DIR, STORAGE);
		migrate(default_storage.db);
	}
	return default_storage;
}

/** The storage of the current request's site. */
export function get_storage(): Storage {
	return site.storage ?? get_default_storage();
}

/**
 * The current site's database. Each access goes to the storage of the request
 * it runs in, so code imports db once and uses it inside functions; never
 * capture a collection at module level.
 */
export const db: Database = {
	transaction: (fn) => get_storage().db.transaction(fn),
	get documents() {
		return get_storage().db.documents;
	},
	get slugs() {
		return get_storage().db.slugs;
	},
	get translations() {
		return get_storage().db.translations;
	},
	get document_refs() {
		return get_storage().db.document_refs;
	},
	get asset_refs() {
		return get_storage().db.asset_refs;
	},
	get settings() {
		return get_storage().db.settings;
	},
	get sessions() {
		return get_storage().db.sessions;
	},
	get oauth_clients() {
		return get_storage().db.oauth_clients;
	},
	get oauth_grants() {
		return get_storage().db.oauth_grants;
	},
	get oauth_tokens() {
		return get_storage().db.oauth_tokens;
	},
	get migrations() {
		return get_storage().db.migrations;
	},
	close: () => get_storage().db.close()
};

export const with_transaction = <T>(fn: () => T): T => db.transaction(fn);

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
