import { join } from 'node:path';
import { open_sqlite } from '#lib/server/storage/sqlite.js';
import { open_files } from '#lib/server/storage/files.js';
import { translation_key, type OpenedStore, type SiteStore } from '#lib/server/storage/store.js';
import { parse_edf, serialize_edf } from '#lib/edf.js';
import { document_schema } from './document_schema.js';

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
