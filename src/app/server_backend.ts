import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Backend } from '#lib/server/backend.js';
import { open_sqlite, sqlite_backend } from '#lib/server/backends/sqlite_backend.js';
import { files_backend } from '#lib/server/backends/files_backend.js';
import { parse_edf, serialize_edf } from '#lib/edf.js';
import { document_schema } from './document_schema.js';

export type DataFormat = 'sqlite' | 'files';

/**
 * The backend for a data folder, in the format the folder holds. A new folder
 * gets the requested format, SQLite by default; requesting another format
 * than an existing folder holds is refused rather than silently ignored.
 */
export function backend_for(data_dir: string, requested = ''): Backend {
	if (requested && requested !== 'sqlite' && requested !== 'files')
		throw new Error(`STORAGE must be sqlite or files, not "${requested}".`);
	const held = data_format(data_dir);
	if (held && requested && held !== requested)
		throw new Error(
			`${data_dir} holds a ${held} site, but STORAGE is ${requested}. Convert it with pnpm data:convert --to ${requested}, or leave STORAGE unset.`
		);
	return backend_in(data_dir, held ?? ((requested || 'sqlite') as DataFormat));
}

/**
 * The format a data folder holds: a SQLite database in db.sqlite3, or files
 * in db/. Null for a new folder. A folder holding both is refused; that only
 * happens when a conversion stopped halfway.
 */
export function data_format(data_dir: string): DataFormat | null {
	const sqlite = existsSync(join(data_dir, 'db.sqlite3'));
	const files = existsSync(join(data_dir, 'db'));
	if (sqlite && files)
		throw new Error(
			`${data_dir} holds both a SQLite database and a site in files, which happens when a conversion stops halfway. Keep the one you want and move the other out of the folder.`
		);
	return sqlite ? 'sqlite' : files ? 'files' : null;
}

/**
 * A data folder's backend in the given format: records in db.sqlite3, or in
 * db/ with each document as EDF and every other collection as JSON; asset
 * files in assets/ either way.
 */
export function backend_in(data_dir: string, format: DataFormat): Backend {
	const asset_dir = join(data_dir, 'assets');
	if (format === 'sqlite')
		return sqlite_backend({ db: open_sqlite(join(data_dir, 'db.sqlite3')), asset_dir });
	return files_backend(
		{ db_dir: join(data_dir, 'db'), asset_dir },
		{
			serialize: (document) => serialize_edf(document, document_schema),
			parse: (text) => parse_edf(text, document_schema),
			extension: 'edf'
		}
	);
}

/**
 * Copy a site's content, references, and settings from one backend into
 * another, for example to change formats. Sign-ins and MCP connections are
 * not copied.
 */
export async function copy_site(from: Backend, to: Backend) {
	const documents = await from.list_documents();
	await to.save_documents({
		documents: documents.map(({ version: _, ...record }) => record),
		slugs: await from.list_slugs(),
		translations: {
			put: (await from.list_translations()).map(({ version: _, ...record }) => record)
		},
		document_refs: await from.list_document_refs(),
		asset_refs: await from.list_asset_refs(),
		settings: await from.list_settings()
	});
}
