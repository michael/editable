import type { Document } from 'svedit';

/**
 * Where a site's data goes: a function for each thing Editable reads or
 * writes. Each write is atomic, doing all of its work or none of it, and two
 * writes never interleave. A backend stores what Editable hands it and makes
 * no decisions about content. Every function is asynchronous, so a backend
 * can sit on a network service as easily as on a local file.
 */
export type Backend = {
	/** Migrations with this name as their target run on this backend. */
	name: string;
	/** What the backend is built on. */
	storage: unknown;

	// Pages and the shared banner, nav, and footer
	get_document(document_id: string): Promise<DocumentRecord | null>;
	list_documents(type?: string): Promise<DocumentRecord[]>;
	/** Store documents and what changes with them, all at once; returns the new version of each document written. */
	save_documents(save: DocumentSave): Promise<{ [document_id: string]: string }>;
	/** Delete a page with its slugs, translations, and references, and drop it from others' references. */
	delete_page(document_id: string): Promise<void>;

	// Page URLs: one active slug per page, earlier ones redirect
	resolve_slug(slug: string): Promise<ResolvedSlug | null>;
	get_active_slug(document_id: string): Promise<string | null>;
	list_slugs(): Promise<SlugRecord[]>;

	// What each document refers to, as Editable worked it out on its last save
	list_document_refs(): Promise<DocumentRefsRecord[]>;
	list_asset_refs(): Promise<AssetRefsRecord[]>;

	// Translations: one record per document and language
	list_translations(filter?: {
		document_ids?: string[];
		language?: string;
	}): Promise<TranslationRecord[]>;
	save_translations(save: TranslationSave): Promise<void>;

	// Site settings, such as the home page
	get_setting(key: string): Promise<string | null>;
	list_settings(): Promise<SettingRecord[]>;

	// Private: these let people into the site, so never store them where others can read them.
	get_session(session_id: string): Promise<SessionRecord | null>;
	save_session(session: SessionRecord): Promise<void>;
	delete_session(session_id: string): Promise<void>;
	get_login_throttle(key: string): Promise<LoginThrottleRecord | null>;
	save_login_throttle(throttle: LoginThrottleRecord): Promise<void>;
	get_oauth_grant(grant_id: string): Promise<OAuthGrantRecord | null>;
	save_oauth_grant(grant: OAuthGrantRecord): Promise<void>;
	get_oauth_token(token_hash: string): Promise<OAuthTokenRecord | null>;
	save_oauth_token(token: OAuthTokenRecord): Promise<void>;
	/** Delete a token and return it, so a code or refresh token is only ever redeemed once. */
	take_oauth_token(token_hash: string): Promise<OAuthTokenRecord | null>;
	/** Delete every grant and token, such as when the admin logs out. */
	revoke_oauth_grants(): Promise<void>;
	/** Delete the sessions, grants, and tokens that expired at or before now, in seconds. */
	delete_expired(now: number): Promise<void>;

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

	/** Ids of the migrations it has applied. */
	applied_migrations(): Promise<string[]>;
	/**
	 * Run work as one atomic step: what it does through the run, and every
	 * other call the backend gets meanwhile, such as the saves at its end,
	 * happens completely or not at all.
	 */
	migrate(work: (run: MigrationRun) => Promise<void>): Promise<void>;

	close(): Promise<void>;
};

/** The versions records had when they were read; null for one that did not exist. */
export type Expected = {
	documents?: { [document_id: string]: string | null };
	translations?: (TranslationKey & { version: string | null })[];
};

/** What save_documents stores at once. */
export type DocumentSave = {
	/**
	 * The version each document, and each translation the save changes, had
	 * when it was read, or null if it did not exist. Throw a ConflictError and
	 * write nothing when one has changed.
	 */
	expect?: Expected;
	/** New and changed documents; the backend gives each a new version. */
	documents?: NewDocument[];
	/** What the saved documents now link to and use, replacing what they did before. */
	document_refs?: DocumentRefsRecord[];
	asset_refs?: AssetRefsRecord[];
	/**
	 * Translations that change with the documents: put writes a document's whole
	 * translation in one language, replacing the stored one; delete removes it.
	 */
	translations?: { put?: NewTranslation[]; delete?: TranslationKey[] };
	/**
	 * Slugs added or changed, such as a new page's first one or a renamed page's.
	 * Throw a ConflictError when one is another page's active slug.
	 */
	slugs?: SlugRecord[];
	/** Settings that change with the documents, such as the home page. */
	settings?: SettingRecord[];
};

/**
 * What a backend hands a migration run. Migrations run at every point of the
 * backend's history, so reading and writing documents here must work with
 * every way it has stored them, not just the latest.
 */
export type MigrationRun = {
	/** What its migrations receive, spread next to the content helpers. */
	storage: object;
	read_documents(): Promise<NewDocument[]>;
	/** Add or replace documents; their versions and references follow at the end of the run. */
	write_documents(documents: NewDocument[]): Promise<void>;
	record_migration(id: string): Promise<void>;
};

/** What save_translations stores at once: some documents' overrides in one language. */
export type TranslationSave = {
	/** Versions as in DocumentSave: of the documents, and of their translations in this language. */
	expect: Required<Expected>;
	/** Whole translations written, each replacing the stored one. */
	put: NewTranslation[];
	/** Translations removed, such as one whose overrides were all reverted. */
	delete: TranslationKey[];
	asset_refs: AssetRefsRecord[];
};

/** Thrown by a write whose expected versions no longer match. */
export class ConflictError extends Error {}

export type AssetData = ReadableStream<Uint8Array> | Uint8Array;
export type AssetWritten = { bytes_written: number; sha256: string };
export type ByteRange = { start: number; end: number };

/**
 * A page or a shared banner, nav, or footer. Its version changes with every
 * write, set by the backend: a counter, a random token, or what the storage
 * already has, such as a Git blob hash.
 */
export type DocumentRecord = {
	document_id: string;
	type: string;
	data: Document;
	created_at: string;
	updated_at: string;
	version: string;
};
export type NewDocument = Omit<DocumentRecord, 'version'>;

/** A page's slug; a page has one active slug, its earlier ones redirect. */
export type SlugRecord = {
	slug: string;
	document_id: string;
	is_active: boolean;
	created_at: string;
};

export type ResolvedSlug = { document_id: string; is_active: boolean; active_slug: string };

/** A language's overrides for one document, as JSON text, versioned like documents. */
export type TranslationRecord = {
	document_id: string;
	language: string;
	value: string;
	updated_at: string;
	version: string;
};
export type NewTranslation = Omit<TranslationRecord, 'version'>;
export type TranslationKey = { document_id: string; language: string };

/** A site-wide value by key, such as home_page_id. */
export type SettingRecord = { key: string; value: string };

/** The pages a document links to, in document order. */
export type DocumentRefsRecord = { document_id: string; target_ids: string[] };

/** The assets a document and its translations refer to. */
export type AssetRefsRecord = { document_id: string; asset_ids: string[] };

export type SessionRecord = { session_id: string; expires: number };

/** Failed sign-ins and the lockout they caused, under 'admin' for the password. */
export type LoginThrottleRecord = { key: string; failed_count: number; locked_until: number };

export type OAuthGrantRecord = {
	grant_id: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	created_at: number;
	expires_at: number;
};

export type OAuthTokenRecord = {
	token_hash: string;
	grant_id: string;
	kind: string;
	expires_at: number;
};
