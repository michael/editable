import { DATA_DIR, ASSET_PATH, ASSET_GRACE_PERIOD_DAYS, STORAGE } from '#app/server_config.js';
import { ASSET_ID_REGEX } from '#app/config.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';
import type { SiteStore } from '#lib/server/store.js';
import { migrate } from '#app/migrations.js';
import { open_file_folder, open_sqlite_folder } from '#app/storage.js';
import { site } from '#app/server_site.js';

/** A site's records and asset files. */
export type SiteStorage = {
	store: SiteStore;
	assets: ReturnType<typeof create_asset_storage>;
};

let default_storage: SiteStorage | undefined;

/**
 * The deployment's own storage in DATA_DIR, opened on first use and brought
 * up to date: a SQLite database, or with STORAGE=files a folder of EDF
 * documents and JSON records.
 */
export function get_default_storage(): SiteStorage {
	if (!default_storage) {
		const assets = create_asset_storage({
			asset_path: ASSET_PATH,
			asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
			asset_id_regex: ASSET_ID_REGEX
		});
		const store = STORAGE === 'files' ? open_file_folder(DATA_DIR) : open_sqlite_folder(DATA_DIR);
		migrate(store);
		default_storage = { store, assets };
	}
	return default_storage;
}

/** The storage of the current request's site. */
export function get_storage(): SiteStorage {
	return site.storage ?? get_default_storage();
}

/**
 * The current site's records. Each access goes to the storage of the request
 * it runs in, so code imports store once and uses it inside functions; never
 * capture a collection at module level.
 */
export const store: SiteStore = {
	transaction: (fn) => get_storage().store.transaction(fn),
	get documents() {
		return get_storage().store.documents;
	},
	get slugs() {
		return get_storage().store.slugs;
	},
	get translations() {
		return get_storage().store.translations;
	},
	get document_refs() {
		return get_storage().store.document_refs;
	},
	get asset_refs() {
		return get_storage().store.asset_refs;
	},
	get settings() {
		return get_storage().store.settings;
	},
	get sessions() {
		return get_storage().store.sessions;
	},
	get oauth_clients() {
		return get_storage().store.oauth_clients;
	},
	get oauth_grants() {
		return get_storage().store.oauth_grants;
	},
	get oauth_tokens() {
		return get_storage().store.oauth_tokens;
	}
};

export const with_transaction = <T>(fn: () => T): T => store.transaction(fn);

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
