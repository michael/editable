import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Document } from 'svedit';
import {
	ConflictError,
	type AssetRefsRecord,
	type Backend,
	type DocumentRecord,
	type DocumentRefsRecord,
	type LoginThrottleRecord,
	type NewTranslation,
	type OAuthClientRecord,
	type OAuthGrantRecord,
	type OAuthTokenRecord,
	type SessionRecord,
	type SettingRecord,
	type SlugRecord,
	type TranslationKey,
	type TranslationRecord
} from '../backend.js';
import { asset_files } from './asset_files.js';

/** What files_backend is built on, and what its storage migrations receive. */
export type FilesStorage = {
	/** The folder the site's records are kept in, its database as files. */
	db_dir: string;
	/** The folder asset files are kept in. */
	asset_dir: string;
};

/** Replace a file in one step, so a reader never sees it half written. */
function write(path: string, text: string) {
	writeFileSync(`${path}.tmp`, text);
	renameSync(`${path}.tmp`, path);
}

type Records<T> = { [key: string]: T };

/** Translations are kept by document and language. */
const translation_key = (document_id: string, language: string) => `${document_id}:${language}`;
type Meta = Omit<DocumentRecord, 'document_id' | 'data'>;

/**
 * Records and asset files in plain files. Each document is a file of its own,
 * with its type, timestamps, and version in documents.json, and every other
 * kind of record is one JSON file of records by key. Files are read on every
 * call and each is replaced in one step, so the folder is the whole truth and
 * can be edited or versioned by hand. File access is synchronous, so each
 * function runs to its end before another starts, but a write that touches
 * several files is not atomic if the process stops halfway. The storage
 * migrations it has applied are recorded in _migrations.json. Documents are
 * written with serialize and read with parse, as EDF when the schema is at hand.
 */
export function files_backend(
	storage: FilesStorage,
	format: {
		serialize: (document: Document) => string;
		parse: (text: string) => Document;
		extension: string;
	}
): Backend {
	const dir = storage.db_dir;
	mkdirSync(join(dir, 'documents'), { recursive: true });

	const path_of = (name: string) => join(dir, `${name}.json`);
	const load = <T>(name: string): Records<T> =>
		existsSync(path_of(name)) ? JSON.parse(readFileSync(path_of(name), 'utf8')) : {};
	const store = (name: string, records: Records<unknown>) =>
		write(path_of(name), JSON.stringify(records, null, '\t') + '\n');
	function change<T>(name: string, fn: (records: Records<T>) => void) {
		const records = load<T>(name);
		fn(records);
		store(name, records);
	}

	const document_path = (id: string) => join(dir, 'documents', `${id}.${format.extension}`);
	const read_document = (document_id: string, meta: Meta): DocumentRecord => ({
		document_id,
		...meta,
		data: format.parse(readFileSync(document_path(document_id), 'utf8'))
	});

	function assert_version(
		current: { version: string } | undefined,
		expected: string | null,
		name: string
	) {
		if ((current?.version ?? null) !== expected)
			throw new ConflictError(`${name} changed since it was read.`);
	}

	function put_refs(name: string, records: (DocumentRefsRecord | AssetRefsRecord)[]) {
		change(name, (all) => {
			for (const record of records) all[record.document_id] = record;
		});
	}

	function put_translations(put: NewTranslation[], remove: TranslationKey[]) {
		change<TranslationRecord>('translations', (all) => {
			for (const record of put)
				all[translation_key(record.document_id, record.language)] = {
					...record,
					version: randomUUID()
				};
			for (const { document_id, language } of remove)
				delete all[translation_key(document_id, language)];
		});
	}

	const get = async <T>(name: string, key: string) => load<T>(name)[key] ?? null;
	const list = async <T>(name: string) => Object.values(load<T>(name));
	const put = async <T>(name: string, key: string, record: T) =>
		change<T>(name, (all) => {
			all[key] = record;
		});
	const remove = async (name: string, key: string) =>
		change(name, (all) => {
			delete all[key];
		});
	const applied = (): string[] => load<string[]>('_migrations').migrations ?? [];

	return {
		name: 'files',
		storage,

		get_document: async (document_id) => {
			const meta = load<Meta>('documents')[document_id];
			return meta ? read_document(document_id, meta) : null;
		},
		list_documents: async (type) =>
			Object.entries(load<Meta>('documents'))
				.filter(([, meta]) => !type || meta.type === type)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([document_id, meta]) => read_document(document_id, meta)),
		save_documents: async (save) => {
			const meta = load<Meta>('documents');
			for (const [document_id, version] of Object.entries(save.expect ?? {}))
				assert_version(meta[document_id], version, document_id);
			for (const { document_id, data, ...rest } of save.documents ?? []) {
				write(document_path(document_id), format.serialize(data));
				meta[document_id] = { ...rest, version: randomUUID() };
			}
			if (save.documents?.length) store('documents', meta);
			if (save.document_refs) put_refs('document_refs', save.document_refs);
			if (save.asset_refs) put_refs('asset_refs', save.asset_refs);
			if (save.translations)
				put_translations(save.translations.put ?? [], save.translations.delete ?? []);
			if (save.slugs)
				change<SlugRecord>('slugs', (all) => {
					for (const record of save.slugs!) all[record.slug] = record;
				});
			if (save.settings)
				change<SettingRecord>('settings', (all) => {
					for (const record of save.settings!) all[record.key] = record;
				});
		},
		delete_page: async (document_id) => {
			change('documents', (all) => {
				delete all[document_id];
			});
			rmSync(document_path(document_id), { force: true });
			change<SlugRecord>('slugs', (all) => {
				for (const [slug, record] of Object.entries(all))
					if (record.document_id === document_id) delete all[slug];
			});
			change<TranslationRecord>('translations', (all) => {
				for (const [key, record] of Object.entries(all))
					if (record.document_id === document_id) delete all[key];
			});
			change('asset_refs', (all) => {
				delete all[document_id];
			});
			change<DocumentRefsRecord>('document_refs', (all) => {
				delete all[document_id];
				for (const refs of Object.values(all))
					refs.target_ids = refs.target_ids.filter((id) => id !== document_id);
			});
		},

		resolve_slug: async (slug) => {
			const slugs = Object.values(load<SlugRecord>('slugs'));
			const record = slugs.find((candidate) => candidate.slug === slug);
			const active =
				record && slugs.find((s) => s.document_id === record.document_id && s.is_active);
			return active
				? { document_id: active.document_id, is_active: record.is_active, active_slug: active.slug }
				: null;
		},
		get_active_slug: async (document_id) =>
			Object.values(load<SlugRecord>('slugs')).find(
				(record) => record.document_id === document_id && record.is_active
			)?.slug ?? null,
		list_slugs: () => list<SlugRecord>('slugs'),

		list_document_refs: () => list<DocumentRefsRecord>('document_refs'),
		list_asset_refs: () => list<AssetRefsRecord>('asset_refs'),

		list_translations: async ({ document_ids, language } = {}) =>
			Object.values(load<TranslationRecord>('translations'))
				.filter(
					(record) =>
						(!document_ids || document_ids.includes(record.document_id)) &&
						(!language || record.language === language)
				)
				.sort(
					(a, b) =>
						a.document_id.localeCompare(b.document_id) || a.language.localeCompare(b.language)
				),
		save_translations: async (save) => {
			const meta = load<Meta>('documents');
			const translations = load<TranslationRecord>('translations');
			for (const [document_id, version] of Object.entries(save.expect.documents))
				assert_version(meta[document_id], version, document_id);
			for (const { document_id, language, version } of save.expect.translations)
				assert_version(
					translations[translation_key(document_id, language)],
					version,
					translation_key(document_id, language)
				);
			put_translations(save.put, save.delete);
			put_refs('asset_refs', save.asset_refs);
		},

		get_setting: async (key) => load<SettingRecord>('settings')[key]?.value ?? null,
		list_settings: () => list<SettingRecord>('settings'),

		get_session: (session_id) => get<SessionRecord>('sessions', session_id),
		save_session: (session) => put('sessions', session.session_id, session),
		delete_session: (session_id) => remove('sessions', session_id),
		get_login_throttle: (key) => get<LoginThrottleRecord>('login_throttle', key),
		save_login_throttle: (throttle) => put('login_throttle', throttle.key, throttle),
		list_oauth_clients: () => list<OAuthClientRecord>('oauth_clients'),
		get_oauth_client: (client_id) => get<OAuthClientRecord>('oauth_clients', client_id),
		save_oauth_client: (client) => put('oauth_clients', client.client_id, client),
		delete_oauth_client: (client_id) => remove('oauth_clients', client_id),
		list_oauth_grants: () => list<OAuthGrantRecord>('oauth_grants'),
		get_oauth_grant: (grant_id) => get<OAuthGrantRecord>('oauth_grants', grant_id),
		save_oauth_grant: (grant) => put('oauth_grants', grant.grant_id, grant),
		delete_oauth_grant: (grant_id) => remove('oauth_grants', grant_id),
		get_oauth_token: (token_hash) => get<OAuthTokenRecord>('oauth_tokens', token_hash),
		save_oauth_token: (token) => put('oauth_tokens', token.token_hash, token),
		take_oauth_token: async (token_hash) => {
			const tokens = load<OAuthTokenRecord>('oauth_tokens');
			const token = tokens[token_hash] ?? null;
			if (token) {
				delete tokens[token_hash];
				store('oauth_tokens', tokens);
			}
			return token;
		},
		revoke_oauth_grants: async (now) => {
			store('oauth_tokens', {});
			change<OAuthGrantRecord>('oauth_grants', (all) => {
				for (const grant of Object.values(all)) if (grant.expires_at > now) grant.expires_at = now;
			});
		},
		delete_expired: async (now) => {
			change<SessionRecord>('sessions', (all) => {
				for (const [key, session] of Object.entries(all))
					if (session.expires <= now) delete all[key];
			});
			change<OAuthTokenRecord>('oauth_tokens', (all) => {
				for (const [key, token] of Object.entries(all))
					if (token.expires_at <= now) delete all[key];
			});
		},

		...asset_files(storage.asset_dir),

		applied_migrations: async () => applied(),
		run_migration: async (id, up) => {
			await up(storage);
			store('_migrations', { migrations: [...applied(), id] });
		},

		close: async () => {}
	};
}
