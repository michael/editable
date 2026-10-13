import { DATA_DIR, DB_PATH, ASSET_PATH, ASSET_GRACE_PERIOD_DAYS } from '#app/server_config.js';
import { ASSET_ID_REGEX } from '#app/config.js';
import { create_database } from '#lib/server/db.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';

const database = create_database({ data_dir: DATA_DIR, db_path: DB_PATH });
export const db = database.db;
export const with_transaction = database.with_transaction;

export const asset_storage = create_asset_storage({
	asset_path: ASSET_PATH,
	asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
	asset_id_regex: ASSET_ID_REGEX
});

export const {
	write_asset,
	write_variant,
	write_poster,
	asset_exists,
	delete_asset,
	create_asset_read_stream,
	create_variant_read_stream,
	create_poster_read_stream,
	asset_size,
	touch_asset,
	delete_orphaned_assets,
	asset_path,
	variant_path,
	poster_path
} = asset_storage;
