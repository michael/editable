import type { Document } from 'svedit';

/**
 * What a site stores, as a few collections of records with the same four
 * operations each. A backend only keeps records and hands them back:
 * Editable computes what it stores, including the references it keeps per
 * document: the pages it links to, so the page browser knows what is linked
 * from where, and the assets it uses, so cleanup knows what is still in use.
 * Records carry their own timestamps.
 */
export type Collection<Record> = {
	get(key: string): Record | null;
	all(): Record[];
	/** Insert or replace the record stored under the key. */
	put(key: string, record: Record): void;
	delete(key: string): void;
};

export type DocumentRecord = {
	document_id: string;
	type: string;
	data: Document;
	created_at: string;
	updated_at: string;
};

export type SlugRecord = {
	slug: string;
	document_id: string;
	is_active: boolean;
	created_at: string;
};

/** A language's overrides for one document, as JSON text. */
export type TranslationRecord = {
	document_id: string;
	language: string;
	value: string;
	updated_at: string;
};

/** The pages a document links to, in document order, kept up to date on every write. */
export type DocumentRefsRecord = { document_id: string; target_ids: string[] };

/** The assets a document and its translations refer to, kept up to date on every write. */
export type AssetRefsRecord = { document_id: string; asset_ids: string[] };

export type SessionRecord = { session_id: string; expires: number };

export type OAuthClientRecord = {
	client_id: string;
	client_name: string;
	redirect_uris: string[];
	created_at: number;
};

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

/** Translations are keyed by document and language. */
export const translation_key = (document_id: string, language: string) =>
	`${document_id}:${language}`;

export type SiteStore = {
	/** Run writes as one unit; a backend without transactions runs them in sequence. */
	transaction<T>(fn: () => T): T;
	documents: Collection<DocumentRecord>;
	slugs: Collection<SlugRecord>;
	translations: Collection<TranslationRecord>;
	document_refs: Collection<DocumentRefsRecord>;
	asset_refs: Collection<AssetRefsRecord>;
	settings: Collection<string>;
	sessions: Collection<SessionRecord>;
	oauth_clients: Collection<OAuthClientRecord>;
	oauth_grants: Collection<OAuthGrantRecord>;
	oauth_tokens: Collection<OAuthTokenRecord>;
};
