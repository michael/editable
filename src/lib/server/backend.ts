import type { Document } from 'svedit';

/**
 * Where a site's data goes. Editable's server code reads and writes through
 * one backend per site; each backend keeps the records and asset files
 * however its storage suits, and makes no decisions about content. Every
 * method is asynchronous, so a backend can sit on a network service as easily
 * as on a local file.
 */
export type Backend = {
	/** Storage migrations with this name as their target run on this backend. */
	name: string;
	/**
	 * What the backend is built on. A transaction's tx has its own, bound to
	 * the transaction, such as a Postgres connection inside it; storage
	 * migrations receive that one.
	 */
	storage: unknown;

	documents: Collection<DocumentRecord>;
	slugs: Collection<SlugRecord>;
	translations: Collection<TranslationRecord>;
	settings: Collection<SettingRecord>;
	document_refs: Collection<DocumentRefsRecord>;
	asset_refs: Collection<AssetRefsRecord>;
	// Private: these let people into the site, so never store them where others can read them.
	sessions: Collection<SessionRecord>;
	login_throttle: Collection<LoginThrottleRecord>;
	oauth_clients: Collection<OAuthClientRecord>;
	oauth_grants: Collection<OAuthGrantRecord>;
	oauth_tokens: Collection<OAuthTokenRecord>;

	/**
	 * Delete the sessions and OAuth tokens that expired at or before now, in
	 * seconds since the epoch, without reading them first. Editable calls it
	 * when it signs someone in or approves an MCP client, so expired entries
	 * do not pile up; a backend may also expire them on its own.
	 */
	delete_expired(now: number): Promise<void>;

	/**
	 * Run work whose writes belong together, through tx; called on a tx, it
	 * runs within that transaction. Transactions in one
	 * process never interleave, reads see the transaction's own writes, and
	 * its writes land together wherever the storage allows. Throw a
	 * ConflictError when the storage changed underneath and the work cannot
	 * be committed.
	 */
	transaction<T>(fn: (tx: Backend) => Promise<T>): Promise<T>;

	/**
	 * Store an asset original under its id, or a file made from it under a
	 * variant name: an image width as 'w640.webp', a video poster as
	 * 'poster.webp'. Returns what was written, so callers can check it.
	 */
	write_asset(asset_id: string, data: AssetData, variant?: string): Promise<AssetWritten>;
	/** The file's bytes, or the given range of them; null when it does not exist. */
	read_asset(
		asset_id: string,
		options?: { variant?: string; range?: ByteRange }
	): Promise<ReadableStream<Uint8Array> | null>;
	/** The file's size in bytes; null when it does not exist. */
	asset_size(asset_id: string, variant?: string): Promise<number | null>;
	/** Delete a variant, or without one the original together with all its variants. */
	delete_asset(asset_id: string, variant?: string): Promise<void>;
	/** Record that an original is in use now, restarting its grace period. */
	touch_asset(asset_id: string): Promise<void>;
	/** Every original with when it was last written or touched, in milliseconds. */
	list_assets(): Promise<{ asset_id: string; last_used: number }[]>;

	/** Ids of the storage migrations it has applied. */
	applied_migrations(): Promise<string[]>;
	record_migration(id: string): Promise<void>;

	close(): Promise<void>;
};

/** The backend's collections of records. */
export const collection_names = [
	'documents',
	'slugs',
	'translations',
	'settings',
	'document_refs',
	'asset_refs',
	'sessions',
	'login_throttle',
	'oauth_clients',
	'oauth_grants',
	'oauth_tokens'
] as const satisfies (keyof Backend)[];

/** A backend's records of one kind, each keyed by a field of its records. */
export type Collection<Record> = {
	get(key: string): Promise<Record | null>;
	all(): Promise<Record[]>;
	/** Insert or replace the record, under the key it carries. */
	put(record: Record): Promise<void>;
	delete(key: string): Promise<void>;
};

/** Thrown by a backend when its storage changed underneath a transaction. */
export class ConflictError extends Error {}

export type AssetData = ReadableStream<Uint8Array> | Uint8Array;
export type AssetWritten = { bytes_written: number; sha256: string };
export type ByteRange = { start: number; end: number };

/** Keyed by document_id. */
export type DocumentRecord = {
	document_id: string;
	type: string;
	data: Document;
	created_at: string;
	updated_at: string;
};

/** Keyed by slug; a page has one active slug, its earlier ones redirect. */
export type SlugRecord = {
	slug: string;
	document_id: string;
	is_active: boolean;
	created_at: string;
};

/** A language's overrides for one document, as JSON text; keyed by translation_key. */
export type TranslationRecord = {
	document_id: string;
	language: string;
	value: string;
	updated_at: string;
};

/** Translations are keyed by document and language. */
export const translation_key = (document_id: string, language: string) =>
	`${document_id}:${language}`;

/**
 * A site-wide value by key: the home page, and the content migrations
 * applied so far, as a JSON list of ids under 'migrations'.
 */
export type SettingRecord = { key: string; value: string };

/** The pages a document links to, in document order; keyed by document_id. */
export type DocumentRefsRecord = { document_id: string; target_ids: string[] };

/** The assets a document and its translations refer to; keyed by document_id. */
export type AssetRefsRecord = { document_id: string; asset_ids: string[] };

/** Keyed by session_id. */
export type SessionRecord = { session_id: string; expires: number };

/** Failed sign-ins and the lockout they caused; keyed by key, 'admin' for the password. */
export type LoginThrottleRecord = { key: string; failed_count: number; locked_until: number };

/** Keyed by client_id. */
export type OAuthClientRecord = {
	client_id: string;
	client_name: string;
	redirect_uris: string[];
	created_at: number;
};

/** Keyed by grant_id. */
export type OAuthGrantRecord = {
	grant_id: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	created_at: number;
	expires_at: number;
};

/** Keyed by token_hash. */
export type OAuthTokenRecord = {
	token_hash: string;
	grant_id: string;
	kind: string;
	expires_at: number;
};
