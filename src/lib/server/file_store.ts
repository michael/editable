import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Document } from 'svedit';
import type { Collection, DocumentRecord, SiteStore } from './store.js';

export type FileStoreOptions = {
	dir: string;
	/** How documents are written to disk, as EDF when the schema is at hand. */
	serialize: (document: Document) => string;
	parse: (text: string) => Document;
	extension: string;
};

/**
 * A site store that keeps every record in files under one directory: each
 * document in its own file, with its type and timestamps in documents.json,
 * and every other collection as one JSON file of records. Files are read on
 * every access and replaced atomically on every write, so the folder is the
 * whole truth and can be edited or versioned by hand. There are no
 * transactions: writes are applied as they come.
 */
export function file_store(options: FileStoreOptions): SiteStore {
	const { dir } = options;
	mkdirSync(join(dir, 'documents'), { recursive: true });

	function write(path: string, text: string) {
		writeFileSync(`${path}.tmp`, text);
		renameSync(`${path}.tmp`, path);
	}
	const read_json = <T>(path: string, fallback: T): T =>
		existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

	/** A collection kept as one JSON object of records by key. */
	function json_collection<Record>(name: string): Collection<Record> {
		const path = join(dir, `${name}.json`);
		const load = () => read_json<{ [key: string]: Record }>(path, {});
		const save = (records: { [key: string]: Record }) =>
			write(path, JSON.stringify(records, null, '\t') + '\n');
		return {
			get: (key) => load()[key] ?? null,
			all: () => Object.values(load()),
			put(key, record) {
				const records = load();
				records[key] = record;
				save(records);
			},
			delete(key) {
				const records = load();
				delete records[key];
				save(records);
			}
		};
	}

	type Meta = { type: string; created_at: string; updated_at: string };
	const meta_path = join(dir, 'documents.json');
	const document_path = (id: string) => join(dir, 'documents', `${id}.${options.extension}`);
	const load_meta = () => read_json<{ [id: string]: Meta }>(meta_path, {});
	const read_document = (id: string, meta: Meta): DocumentRecord => ({
		document_id: id,
		data: options.parse(readFileSync(document_path(id), 'utf8')),
		...meta
	});

	const documents: Collection<DocumentRecord> = {
		get(id) {
			const meta = load_meta()[id];
			return meta && existsSync(document_path(id)) ? read_document(id, meta) : null;
		},
		all() {
			return Object.entries(load_meta())
				.filter(([id]) => existsSync(document_path(id)))
				.map(([id, meta]) => read_document(id, meta));
		},
		put(id, record) {
			const meta = load_meta();
			meta[id] = {
				type: record.type,
				created_at: record.created_at,
				updated_at: record.updated_at
			};
			write(document_path(id), options.serialize(record.data));
			write(meta_path, JSON.stringify(meta, null, '\t') + '\n');
		},
		delete(id) {
			const meta = load_meta();
			delete meta[id];
			if (existsSync(document_path(id))) unlinkSync(document_path(id));
			write(meta_path, JSON.stringify(meta, null, '\t') + '\n');
		}
	};

	return {
		transaction: (fn) => fn(),
		documents,
		slugs: json_collection('slugs'),
		translations: json_collection('translations'),
		settings: json_collection('settings'),
		sessions: json_collection('sessions'),
		oauth_clients: json_collection('oauth_clients'),
		oauth_grants: json_collection('oauth_grants'),
		oauth_tokens: json_collection('oauth_tokens')
	};
}

/** Whether a directory holds a file store. */
export function is_file_store(dir: string) {
	return (
		existsSync(join(dir, 'documents.json')) ||
		readdirSync(dir, { withFileTypes: true }).length === 0
	);
}
