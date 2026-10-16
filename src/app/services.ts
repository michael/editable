import { join } from 'node:path';
import {
	DATA_DIR,
	DB_PATH,
	ASSET_PATH,
	ASSET_GRACE_PERIOD_DAYS,
	STORAGE
} from '#app/server_config.js';
import { ASSET_ID_REGEX } from '#app/config.js';
import { create_database } from '#lib/server/db.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';
import { sqlite_store } from '#lib/server/sqlite_store.js';
import { file_store } from '#lib/server/file_store.js';
import type { SiteStore } from '#lib/server/store.js';
import { parse_edf, serialize_edf } from '#lib/edf.js';
import { document_schema } from '#app/document_schema.js';
import { migrate } from '#app/migrations.js';
import seed_initial_documents from '#app/seed_initial_documents.js';
import { site } from '#app/server_site.js';

/** A site's records and asset files. */
export type SiteStorage = {
	store: SiteStore;
	assets: ReturnType<typeof create_asset_storage>;
};

let default_storage: SiteStorage | undefined;

/**
 * The deployment's own storage in DATA_DIR, opened on first use: a SQLite
 * database brought up to date by the migrations, or with STORAGE=files a
 * folder of EDF documents and JSON records, seeded when empty.
 */
export function get_default_storage(): SiteStorage {
	if (!default_storage) {
		const assets = create_asset_storage({
			asset_path: ASSET_PATH,
			asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
			asset_id_regex: ASSET_ID_REGEX
		});
		let store: SiteStore;
		if (STORAGE === 'files') {
			store = file_store({
				dir: join(DATA_DIR, 'site'),
				serialize: (document) => serialize_edf(document, document_schema),
				parse: (text) => parse_edf(text, document_schema),
				extension: 'edf'
			});
			if (!store.documents.all().length) seed_initial_documents(store);
		} else {
			const { db, with_transaction } = create_database({ data_dir: DATA_DIR, db_path: DB_PATH });
			store = sqlite_store(db, with_transaction);
			migrate(db, with_transaction, () => seed_initial_documents(store));
		}
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
