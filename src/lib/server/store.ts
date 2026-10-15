import type { Document } from 'svedit';

/**
 * What a site stores, as a few collections of records with the same four
 * operations each. Everything Editable derives from documents, such as the
 * page tree, link references, and asset references, is computed from them
 * rather than stored, so a backend only has to keep records and hand them
 * back. Records carry their own timestamps; the store does not set them.
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
	settings: Collection<string>;
	sessions: Collection<SessionRecord>;
	oauth_clients: Collection<OAuthClientRecord>;
	oauth_grants: Collection<OAuthGrantRecord>;
	oauth_tokens: Collection<OAuthTokenRecord>;
};
