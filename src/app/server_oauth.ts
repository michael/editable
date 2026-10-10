import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { error } from '@sveltejs/kit';
import { ORIGIN } from '$app/env/private';
import { require_admin_session } from '#lib/server/auth.js';
import { db } from './services.js';

// An approval grants MCP access for a fixed window; clients refresh short-lived
// access tokens within it and must ask for approval again afterwards.
const GRANT_TTL_SECONDS = 48 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const CODE_TTL_SECONDS = 10 * 60;
const UPLOAD_TOKEN_TTL_SECONDS = 30 * 60;
// Registrations the admin never approved expire; approved clients are kept so
// they can reconnect with the same client_id after their approval ends.
const PENDING_CLIENT_TTL_SECONDS = 24 * 60 * 60;
const MAX_PENDING_CLIENTS = 100;
const CLIENT_METADATA_TIMEOUT_MS = 5000;
const CLIENT_METADATA_MAX_BYTES = 64 * 1024;

type TokenKind = 'code' | 'access' | 'refresh' | 'upload';
type Grant = {
	grant_id: string;
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
	expires_at: number;
};
export type OAuthClient = { client_id: string; client_name: string; redirect_uris: string[] };

export class OAuthError extends Error {
	constructor(
		public code: string,
		message: string,
		public status = 400
	) {
		super(message);
	}
}

const now = () => Math.floor(Date.now() / 1000);
const new_secret = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// Read lazily: static deployments import this module without an ORIGIN.
export const issuer = () => new URL(ORIGIN).origin;
export const mcp_resource = () => `${issuer()}/mcp`;
export const resource_metadata_url = () => `${issuer()}/.well-known/oauth-protected-resource/mcp`;

export function authorization_server_metadata() {
	const issuer_url = issuer();
	return {
		issuer: issuer_url,
		authorization_endpoint: `${issuer_url}/oauth/authorize`,
		token_endpoint: `${issuer_url}/oauth/token`,
		registration_endpoint: `${issuer_url}/oauth/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		authorization_response_iss_parameter_supported: true,
		client_id_metadata_document_supported: true
	};
}

export function protected_resource_metadata() {
	return {
		resource: mcp_resource(),
		authorization_servers: [issuer()],
		bearer_methods_supported: ['header'],
		resource_name: 'Editable'
	};
}

/** Redirects must go to this computer (any port) or to an HTTPS address. */
export function is_allowed_redirect_uri(value: unknown): value is string {
	const url = typeof value === 'string' ? URL.parse(value) : null;
	if (!url || url.hash || url.username || url.password) return false;
	if (url.protocol === 'https:') return true;
	return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

export function is_loopback_redirect(redirect_uri: string) {
	return URL.parse(redirect_uri)?.protocol === 'http:';
}

/** Tokens are bound to this server; clients may omit the resource or send it with a trailing slash. */
export function is_own_resource(resource: string | null | undefined) {
	return !resource || resource.replace(/\/$/, '').toLowerCase() === mcp_resource().toLowerCase();
}

/** Dynamic client registration (RFC 7591) for public clients without a metadata document. */
export function register_client(input: { client_name?: unknown; redirect_uris?: unknown }) {
	const redirect_uris = input.redirect_uris;
	if (
		!Array.isArray(redirect_uris) ||
		redirect_uris.length === 0 ||
		redirect_uris.length > 10 ||
		!redirect_uris.every(is_allowed_redirect_uri)
	)
		throw new OAuthError(
			'invalid_redirect_uri',
			'redirect_uris must list 1 to 10 URIs on localhost or HTTPS.'
		);

	// Registration is unauthenticated: pending registrations expire, and when
	// too many pile up the oldest make room rather than blocking new clients.
	const pending = 'client_id NOT IN (SELECT client_id FROM oauth_grants)';
	db.prepare(`DELETE FROM oauth_clients WHERE created_at < ? AND ${pending}`).run(
		now() - PENDING_CLIENT_TTL_SECONDS
	);
	db.prepare(
		`DELETE FROM oauth_clients WHERE client_id IN (SELECT client_id FROM oauth_clients WHERE ${pending} ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?)`
	).run(MAX_PENDING_CLIENTS - 1);

	const client: OAuthClient = {
		client_id: new_secret(),
		client_name:
			typeof input.client_name === 'string' && input.client_name.trim()
				? input.client_name.trim().slice(0, 100)
				: 'Unnamed MCP client',
		redirect_uris
	};
	db.prepare(
		'INSERT INTO oauth_clients (client_id, client_name, redirect_uris, created_at) VALUES (?, ?, ?, ?)'
	).run(client.client_id, client.client_name, JSON.stringify(redirect_uris), now());
	return client;
}

/** Fetch a client ID metadata document. Only called for logged-in admins, never anonymously. */
async function fetch_client_metadata(client_id: string): Promise<OAuthClient | null> {
	const response = await fetch(client_id, {
		redirect: 'error',
		signal: AbortSignal.timeout(CLIENT_METADATA_TIMEOUT_MS),
		headers: { accept: 'application/json' }
	}).catch(() => null);
	if (!response?.ok) return null;
	const text = await response.text().catch(() => '');
	if (text.length > CLIENT_METADATA_MAX_BYTES) return null;
	let metadata: any;
	try {
		metadata = JSON.parse(text);
	} catch {
		return null;
	}
	if (
		metadata?.client_id !== client_id ||
		!Array.isArray(metadata.redirect_uris) ||
		!metadata.redirect_uris.every(is_allowed_redirect_uri)
	)
		return null;
	return {
		client_id,
		client_name:
			typeof metadata.client_name === 'string' ? metadata.client_name.slice(0, 100) : client_id,
		redirect_uris: metadata.redirect_uris
	};
}

/** Metadata documents live on public HTTPS hosts; the server never fetches internal addresses. */
function is_metadata_document_url(client_id: string) {
	const url = URL.parse(client_id);
	if (url?.protocol !== 'https:' || url.pathname === '/' || url.username || url.password)
		return false;
	const hostname = url.hostname.replace(/^\[|\]$/g, '');
	return (
		isIP(hostname) === 0 && hostname.includes('.') && !/(^|\.)(localhost|local)$/.test(hostname)
	);
}

export async function find_client(client_id: string): Promise<OAuthClient | null> {
	if (is_metadata_document_url(client_id)) return fetch_client_metadata(client_id);
	const row = db
		.prepare('SELECT client_id, client_name, redirect_uris FROM oauth_clients WHERE client_id = ?')
		.get(client_id) as
		{ client_id: string; client_name: string; redirect_uris: string } | undefined;
	return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) } : null;
}

function insert_token(grant_id: string, kind: TokenKind, expires_at: number) {
	const token = new_secret();
	db.prepare(
		'INSERT INTO oauth_tokens (token_hash, grant_id, kind, expires_at) VALUES (?, ?, ?, ?)'
	).run(hash(token), grant_id, kind, expires_at);
	return token;
}

/** The unexpired grant a token of the given kind belongs to. */
function find_grant(token: string, kind: TokenKind): Grant | null {
	const time = now();
	return (
		(db
			.prepare(
				`SELECT g.grant_id, g.client_id, g.redirect_uri, g.code_challenge, g.expires_at
				FROM oauth_tokens t JOIN oauth_grants g ON g.grant_id = t.grant_id
				WHERE t.token_hash = ? AND t.kind = ? AND t.expires_at > ? AND g.expires_at > ?`
			)
			.get(hash(token), kind, time, time) as Grant | undefined) ?? null
	);
}

/** Record an admin's approval and return the authorization code for the client. */
export function approve_client(input: {
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
}) {
	const time = now();
	db.prepare('DELETE FROM oauth_tokens WHERE expires_at <= ?').run(time);
	// A client's latest grant stays as its approval record; older ended ones go.
	db.prepare('DELETE FROM oauth_grants WHERE client_id = ? AND expires_at <= ?').run(
		input.client_id,
		time
	);
	const grant_id = new_secret();
	db.prepare(
		'INSERT INTO oauth_grants (grant_id, client_id, redirect_uri, code_challenge, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(
		grant_id,
		input.client_id,
		input.redirect_uri,
		input.code_challenge,
		time,
		time + GRANT_TTL_SECONDS
	);
	return insert_token(grant_id, 'code', time + CODE_TTL_SECONDS);
}

function issue_tokens(grant: Grant) {
	const access_expires_at = Math.min(now() + ACCESS_TOKEN_TTL_SECONDS, grant.expires_at);
	return {
		access_token: insert_token(grant.grant_id, 'access', access_expires_at),
		token_type: 'Bearer',
		expires_in: access_expires_at - now(),
		refresh_token: insert_token(grant.grant_id, 'refresh', grant.expires_at)
	};
}

function pkce_challenge(verifier: string) {
	return createHash('sha256').update(verifier).digest('base64url');
}

/** Token endpoint grant types: authorization_code (with PKCE) and rotating refresh_token. */
export function exchange_token(params: URLSearchParams) {
	const client_id = params.get('client_id') ?? '';
	if (!is_own_resource(params.get('resource')))
		throw new OAuthError('invalid_target', `Tokens are only issued for ${mcp_resource()}.`);

	if (params.get('grant_type') === 'authorization_code') {
		const code = params.get('code') ?? '';
		const grant = find_grant(code, 'code');
		// Codes are single use, whether or not the exchange succeeds.
		db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').run(hash(code));
		if (
			!grant ||
			grant.client_id !== client_id ||
			grant.redirect_uri !== params.get('redirect_uri') ||
			grant.code_challenge !== pkce_challenge(params.get('code_verifier') ?? '')
		)
			throw new OAuthError('invalid_grant', 'The authorization code is invalid or expired.');
		return issue_tokens(grant);
	}

	if (params.get('grant_type') === 'refresh_token') {
		const refresh_token = params.get('refresh_token') ?? '';
		const grant = find_grant(refresh_token, 'refresh');
		if (!grant || grant.client_id !== client_id)
			throw new OAuthError(
				'invalid_grant',
				'The refresh token is invalid or the 48-hour approval has ended. Connect again.'
			);
		db.prepare('DELETE FROM oauth_tokens WHERE token_hash = ?').run(hash(refresh_token));
		return issue_tokens(grant);
	}

	throw new OAuthError(
		'unsupported_grant_type',
		'Use grant_type authorization_code or refresh_token.'
	);
}

/** The grant behind a valid MCP access token, or null. */
export function verify_access_token(token: string) {
	return find_grant(token, 'access');
}

export function create_upload_token(grant_id: string) {
	const time = now();
	const grant = db
		.prepare('SELECT expires_at FROM oauth_grants WHERE grant_id = ? AND expires_at > ?')
		.get(grant_id, time) as { expires_at: number } | undefined;
	if (!grant) throw new Error('The MCP connection has ended. Connect again.');
	const expires_at = Math.min(time + UPLOAD_TOKEN_TTL_SECONDS, grant.expires_at);
	return { upload_token: insert_token(grant_id, 'upload', expires_at), expires_at };
}

/** End every MCP connection, e.g. when the admin logs out. Clients stay registered. */
export function revoke_all_grants() {
	db.prepare('DELETE FROM oauth_tokens').run();
	db.prepare('UPDATE oauth_grants SET expires_at = ? WHERE expires_at > ?').run(now(), now());
}

/**
 * Allow an asset upload from an admin session or with an upload token from
 * prepare_image_upload. Token uploads come from agents, so the caller
 * validates their files more strictly.
 */
export function authorize_asset_upload(
	request: Request,
	locals: { is_admin?: boolean }
): 'admin_session' | 'upload_token' {
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) {
		require_admin_session(locals);
		return 'admin_session';
	}
	if (!find_grant(token, 'upload'))
		error(401, 'The upload token is invalid or expired. Call prepare_image_upload for a new one.');
	return 'upload_token';
}

const MAX_OAUTH_BODY_BYTES = 16 * 1024;

/** The public OAuth endpoints read small bodies; refuse large ones before buffering them. */
export function assert_small_body(request: Request) {
	if (Number(request.headers.get('content-length')) > MAX_OAUTH_BODY_BYTES)
		throw new OAuthError('invalid_request', 'The request body is too large.', 413);
}

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version'
};

/** JSON response for the public OAuth endpoints, which browser-based clients call cross-origin. */
export function oauth_json(body: unknown, status = 200) {
	return Response.json(body, { status, headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } });
}

export function oauth_preflight() {
	return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function oauth_error_response(err: unknown) {
	if (err instanceof OAuthError)
		return oauth_json({ error: err.code, error_description: err.message }, err.status);
	throw err;
}
