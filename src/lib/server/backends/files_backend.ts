import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import type { Document } from 'svedit';
import { translation_key, type Backend, type Collection, type DocumentRecord } from '../backend.js';
import { asset_files } from './asset_files.js';
import { one_at_a_time } from './one_at_a_time.js';

/** What files_backend is built on, and what its storage migrations receive. */
export type FilesStorage = {
	/** The folder the site's records are kept in. */
	dir: string;
	/** The folder asset files are kept in. */
	asset_dir: string;
};

/** Replace a file in one step, so a reader never sees it half written. */
function write(path: string, text: string) {
	writeFileSync(`${path}.tmp`, text);
	renameSync(`${path}.tmp`, path);
}

/**
 * Records and asset files in plain files. Each document is a file of its own,
 * with its type and timestamps in documents.json, and every other collection
 * is one JSON file of records. Files are read on every access and replaced
 * atomically on every write, so the folder is the whole truth and can be
 * edited or versioned by hand. Operations run one at a time, but a
 * transaction touching several files is not atomic. The storage migrations
 * it has applied are recorded in _migrations.json, like SQLite's _migrations
 * table. Documents are written with serialize and read with parse, as EDF
 * when the schema is at hand.
 */
export function files_backend(
	storage: FilesStorage,
	format: {
		serialize: (document: Document) => string;
		parse: (text: string) => Document;
		extension: string;
	}
): Backend {
	const { dir } = storage;
	mkdirSync(join(dir, 'documents'), { recursive: true });

	const read_json = <T>(path: string, fallback: T): T =>
		existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;

	/** A collection kept as one JSON object of records by key. */
	function json_collection<Record>(
		name: string,
		key_of: (record: Record) => string
	): Collection<Record> {
		const path = join(dir, `${name}.json`);
		const load = () => read_json<{ [key: string]: Record }>(path, {});
		const save = (records: { [key: string]: Record }) =>
			write(path, JSON.stringify(records, null, '\t') + '\n');
		return {
			get: async (key) => load()[key] ?? null,
			all: async () => Object.values(load()),
			async put(record) {
				const records = load();
				records[key_of(record)] = record;
				save(records);
			},
			async delete(key) {
				const records = load();
				delete records[key];
				save(records);
			}
		};
	}

	type Meta = { type: string; created_at: string; updated_at: string };
	const meta_path = join(dir, 'documents.json');
	const document_path = (id: string) => join(dir, 'documents', `${id}.${format.extension}`);
	const load_meta = () => read_json<{ [id: string]: Meta }>(meta_path, {});
	const read_document = (id: string, meta: Meta): DocumentRecord => ({
		document_id: id,
		data: format.parse(readFileSync(document_path(id), 'utf8')),
		...meta
	});

	const documents: Collection<DocumentRecord> = {
		async get(id) {
			const meta = load_meta()[id];
			return meta && existsSync(document_path(id)) ? read_document(id, meta) : null;
		},
		async all() {
			return Object.entries(load_meta())
				.filter(([id]) => existsSync(document_path(id)))
				.map(([id, meta]) => read_document(id, meta));
		},
		async put(record) {
			const id = record.document_id;
			const meta = load_meta();
			meta[id] = {
				type: record.type,
				created_at: record.created_at,
				updated_at: record.updated_at
			};
			write(document_path(id), format.serialize(record.data));
			write(meta_path, JSON.stringify(meta, null, '\t') + '\n');
		},
		async delete(id) {
			const meta = load_meta();
			delete meta[id];
			if (existsSync(document_path(id))) unlinkSync(document_path(id));
			write(meta_path, JSON.stringify(meta, null, '\t') + '\n');
		}
	};

	const migrations_path = join(dir, '_migrations.json');
	const applied = (): string[] => read_json(migrations_path, { migrations: [] }).migrations;

	const no_transaction = () => {};
	return one_at_a_time(
		{
			name: 'files',
			storage,
			documents,
			slugs: json_collection('slugs', (record) => record.slug),
			translations: json_collection('translations', (record) =>
				translation_key(record.document_id, record.language)
			),
			settings: json_collection('settings', (record) => record.key),
			document_refs: json_collection('document_refs', (record) => record.document_id),
			asset_refs: json_collection('asset_refs', (record) => record.document_id),
			sessions: json_collection('sessions', (record) => record.session_id),
			login_throttle: json_collection('login_throttle', (record) => record.key),
			oauth_clients: json_collection('oauth_clients', (record) => record.client_id),
			oauth_grants: json_collection('oauth_grants', (record) => record.grant_id),
			oauth_tokens: json_collection('oauth_tokens', (record) => record.token_hash),
			...asset_files(storage.asset_dir),
			applied_migrations: async () => applied(),
			record_migration: async (id) =>
				write(
					migrations_path,
					JSON.stringify({ migrations: [...applied(), id] }, null, '\t') + '\n'
				),
			close: async () => {}
		},
		{ begin: no_transaction, commit: no_transaction, rollback: no_transaction }
	);
}
