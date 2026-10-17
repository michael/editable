import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { open_sqlite } from '#lib/server/storage/sqlite.js';
import { open_files } from '#lib/server/storage/files.js';
import { translation_key, type OpenedStore, type SiteStore } from '#lib/server/storage/store.js';
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
 * Open a data folder in the format it holds. A new folder gets the requested
 * format, SQLite by default; requesting another format than an existing
 * folder holds is refused rather than silently ignored.
 */
export function open_data_folder(data_dir: string, requested = ''): OpenedStore {
	if (requested && requested !== 'sqlite' && requested !== 'files')
		throw new Error(`STORAGE must be sqlite or files, not "${requested}".`);
	const held = data_format(data_dir);
	if (held && requested && held !== requested)
		throw new Error(
			`${data_dir} holds a ${held} site, but STORAGE is ${requested}. Convert it with pnpm data:convert --to ${requested}, or leave STORAGE unset.`
		);
	return (held ?? (requested || 'sqlite')) === 'files'
		? open_file_folder(data_dir)
		: open_sqlite_folder(data_dir);
}

/** A site in data_dir/db.sqlite3; run migrate before using its store. */
export function open_sqlite_folder(data_dir: string): OpenedStore {
	return open_sqlite({ data_dir, db_path: join(data_dir, 'db.sqlite3') });
}

/**
 * A site as files in data_dir/site: each document as EDF, every other
 * collection as JSON. Run migrate before using its store.
 */
export function open_file_folder(data_dir: string): OpenedStore {
	return open_files({
		dir: join(data_dir, 'site'),
		serialize: (document) => serialize_edf(document, document_schema),
		parse: (text) => parse_edf(text, document_schema),
		extension: 'edf'
	});
}

type Collections = Omit<SiteStore, 'transaction'>;
type RecordOf<K extends keyof Collections> = ReturnType<Collections[K]['all']>[number];

/** How each collection keys its records. */
const record_keys: { [K in keyof Collections]: (record: RecordOf<K>) => string } = {
	documents: (record) => record.document_id,
	slugs: (record) => record.slug,
	translations: (record) => translation_key(record.document_id, record.language),
	document_refs: (record) => record.document_id,
	asset_refs: (record) => record.document_id,
	settings: (record) => record.key,
	sessions: (record) => record.session_id,
	oauth_clients: (record) => record.client_id,
	oauth_grants: (record) => record.grant_id,
	oauth_tokens: (record) => record.token_hash
};

/** Copy every record of one store into another, for example to change backends. */
export function copy_store(from: SiteStore, to: SiteStore) {
	to.transaction(() => {
		for (const name of Object.keys(record_keys) as (keyof Collections)[]) {
			const key_of = record_keys[name] as (record: unknown) => string;
			const collection = to[name] as { put: (key: string, record: unknown) => void };
			for (const record of from[name].all()) collection.put(key_of(record), record);
		}
	});
}
