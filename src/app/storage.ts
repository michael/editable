import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { open_sqlite, sqlite_database } from '#lib/server/storage/backends/sqlite_database.js';
import { file_database } from '#lib/server/storage/backends/file_database.js';
import { file_assets } from '#lib/server/storage/backends/file_assets.js';
import type { Collection, Database } from '#lib/server/storage/database.js';
import type { Storage } from '#lib/server/storage/storage.js';
import { ASSET_GRACE_PERIOD_DAYS } from './server_config.js';
import { ASSET_ID_REGEX } from './config.js';
import { parse_edf, serialize_edf } from '#lib/edf.js';
import { document_schema } from './document_schema.js';

export type DataFormat = 'sqlite' | 'files';

/**
 * The format a data folder holds: a SQLite database in db.sqlite3, or files
 * in site/. Null for a new folder. A folder holding both is refused; that only
 * happens when a conversion stopped halfway.
 */
export function data_format(data_dir: string): DataFormat | null {
	const sqlite = existsSync(join(data_dir, 'db.sqlite3'));
	const files = existsSync(join(data_dir, 'site'));
	if (sqlite && files)
		throw new Error(
			`${data_dir} holds both a SQLite database and a site in files, which happens when a conversion stops halfway. Keep the one you want and move the other out of the folder.`
		);
	return sqlite ? 'sqlite' : files ? 'files' : null;
}

/**
 * The storage of a data folder: its database in the format the folder holds,
 * and its assets in data_dir/assets. A new folder gets the requested format,
 * SQLite by default; requesting another format than an existing folder holds
 * is refused rather than silently ignored. Run migrate on its db before using
 * it.
 */
export function storage_for(data_dir: string, requested = ''): Storage {
	if (requested && requested !== 'sqlite' && requested !== 'files')
		throw new Error(`STORAGE must be sqlite or files, not "${requested}".`);
	const held = data_format(data_dir);
	if (held && requested && held !== requested)
		throw new Error(
			`${data_dir} holds a ${held} site, but STORAGE is ${requested}. Convert it with pnpm data:convert --to ${requested}, or leave STORAGE unset.`
		);
	return {
		db: database_for(data_dir, held ?? ((requested || 'sqlite') as DataFormat)),
		assets: file_assets({
			asset_path: join(data_dir, 'assets'),
			asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
			asset_id_regex: ASSET_ID_REGEX
		})
	};
}

/**
 * A data folder's database in the given format: SQLite in
 * data_dir/db.sqlite3, or files in data_dir/site, with each document as EDF
 * and every other collection as JSON. Run migrate before using it.
 */
export function database_for(data_dir: string, format: DataFormat): Database {
	if (format === 'sqlite') return sqlite_database(open_sqlite(join(data_dir, 'db.sqlite3')));
	return file_database({
		dir: join(data_dir, 'site'),
		serialize: (document) => serialize_edf(document, document_schema),
		parse: (text) => parse_edf(text, document_schema),
		extension: 'edf'
	});
}

const collections = [
	'documents',
	'slugs',
	'translations',
	'document_refs',
	'asset_refs',
	'settings',
	'sessions',
	'oauth_clients',
	'oauth_grants',
	'oauth_tokens'
] satisfies (keyof Database)[];

/** Copy every record of one database into another, for example to change backends. */
export function copy_database(from: Database, to: Database) {
	to.transaction(() => {
		for (const name of collections)
			for (const record of from[name].all()) (to[name] as Collection<unknown>).put(record);
	});
}
