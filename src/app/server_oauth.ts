import { createHash, randomBytes } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { site } from './server_site.js';
import { require_user } from '#lib/server/auth.js';
import { backend } from './services.js';
import type { OAuthGrantRecord, OAuthTokenRecord } from '#lib/server/backend.js';

// An approval grants MCP access for a fixed window; clients refresh short-lived
// access tokens within it and must ask for approval again afterwards.
const GRANT_TTL_SECONDS = 48 * 60 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const CODE_TTL_SECONDS = 10 * 60;
const UPLOAD_TOKEN_TTL_SECONDS = 30 * 60;

type TokenKind = 'code' | 'access' | 'refresh' | 'upload';
type Grant = OAuthGrantRecord;
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

// Each site is its own authorization server at its origin and base path, read per request.
export const issuer = () => {
	const { origin, base } = site;
	return `${new URL(origin).origin}${base}`;
};
export const mcp_resource = () => `${issuer()}/mcp`;
// RFC 9728 puts a resource's metadata at the host root with the resource's path appended.
export const resource_metadata_url = () => {
	const { origin, base } = site;
	return `${new URL(origin).origin}/.well-known/oauth-protected-resource${base}/mcp`;
};

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
		authorization_response_iss_parameter_supported: true
	};
}

export function protected_resource_metadata() {
	return {
		resource: mcp_resource(),
		authorization_servers: [issuer()],
		bearer_methods_supported: ['header'],
		resource_name: issuer().replace(/^https?:\/\//, '')
	};
}

/** Redirects must go to this computer (any port) or to an HTTPS address. */
export function is_allowed_redirect_uri(value: unknown): value is string {
	const url = typeof value === 'string' ? URL.parse(value) : null;
	if (!url || url.hash || url.username || url.password) return false;
	if (url.protocol === 'https:') return true;
	return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

/** Tokens are bound to this server; clients may omit the resource or send it with a trailing slash. */
export function is_own_resource(resource: string | null | undefined) {
	return !resource || resource.replace(/\/$/, '').toLowerCase() === mcp_resource().toLowerCase();
}

const is_redirect_uris = (value: unknown): value is string[] =>
	Array.isArray(value) &&
	value.length > 0 &&
	value.length <= 10 &&
	value.every(is_allowed_redirect_uri);

/**
 * Dynamic client registration (RFC 7591) for public clients. Anyone may
 * register, so a stored registration would prove nothing: the client_id is
 * the registration itself, and a site never forgets a client, even when its
 * data is restored or replaced.
 */
export function register_client(input: {
	client_name?: unknown;
	redirect_uris?: unknown;
}): OAuthClient {
	if (!is_redirect_uris(input.redirect_uris))
		throw new OAuthError(
			'invalid_redirect_uri',
			'redirect_uris must list 1 to 10 URIs on localhost or HTTPS.'
		);
	const registration = {
		client_name:
			typeof input.client_name === 'string' && input.client_name.trim()
				? input.client_name.trim().slice(0, 100)
				: 'Unnamed MCP client',
		redirect_uris: input.redirect_uris
	};
	const client_id = Buffer.from(JSON.stringify(registration)).toString('base64url');
	return { client_id, ...registration };
}

export function find_client(client_id: string): OAuthClient | null {
	try {
		const client = register_client(JSON.parse(Buffer.from(client_id, 'base64url').toString()));
		// Anyone can make a client_id: accept only what registration gives out, so none skips its checks.
		return client.client_id === client_id ? client : null;
	} catch {
		return null;
	}
}

async function insert_token(grant_id: string, kind: TokenKind, expires_at: number) {
	const token = new_secret();
	await backend.save_oauth_token({ token_hash: hash(token), grant_id, kind, expires_at });
	return token;
}

/** The unexpired grant an unexpired token of the given kind belongs to. */
async function grant_of(record: OAuthTokenRecord | null, kind: TokenKind): Promise<Grant | null> {
	const time = now();
	if (!record || record.kind !== kind || record.expires_at <= time) return null;
	const grant = await backend.get_oauth_grant(record.grant_id);
	return grant && grant.expires_at > time ? grant : null;
}

const find_grant = async (token: string, kind: TokenKind) =>
	grant_of(await backend.get_oauth_token(hash(token)), kind);

/** Record an admin's approval and return the authorization code for the client. */
export async function approve_client(input: {
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
}) {
	const time = now();
	await backend.delete_expired(time);
	const grant_id = new_secret();
	await backend.save_oauth_grant({
		grant_id,
		...input,
		created_at: time,
		expires_at: time + GRANT_TTL_SECONDS
	});
	return insert_token(grant_id, 'code', time + CODE_TTL_SECONDS);
}

async function issue_tokens(grant: Grant) {
	const access_expires_at = Math.min(now() + ACCESS_TOKEN_TTL_SECONDS, grant.expires_at);
	return {
		access_token: await insert_token(grant.grant_id, 'access', access_expires_at),
		token_type: 'Bearer',
		expires_in: access_expires_at - now(),
		refresh_token: await insert_token(grant.grant_id, 'refresh', grant.expires_at)
	};
}

function pkce_challenge(verifier: string) {
	return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Token endpoint grant types: authorization_code (with PKCE) and rotating
 * refresh_token. The presented code or refresh token is taken out of the
 * backend in one step, so it can only ever be redeemed once.
 */
export async function exchange_token(params: URLSearchParams) {
	const client_id = params.get('client_id') ?? '';
	// invalid_client makes the client register again.
	if (!find_client(client_id))
		throw new OAuthError('invalid_client', 'The app could not be identified. Connect again.', 401);
	if (!is_own_resource(params.get('resource')))
		throw new OAuthError('invalid_target', `Tokens are only issued for ${mcp_resource()}.`);

	if (params.get('grant_type') === 'authorization_code') {
		const code = params.get('code') ?? '';
		// Codes are single use, whether or not the exchange succeeds.
		const grant = await grant_of(await backend.take_oauth_token(hash(code)), 'code');
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
		const grant = await grant_of(await backend.take_oauth_token(hash(refresh_token)), 'refresh');
		if (!grant || grant.client_id !== client_id)
			throw new OAuthError(
				'invalid_grant',
				'The refresh token is invalid or the 48-hour approval has ended. Connect again.'
			);
		return issue_tokens(grant);
	}

	throw new OAuthError(
		'unsupported_grant_type',
		'Use grant_type authorization_code or refresh_token.'
	);
}

/** The grant behind a valid MCP access token, or null. */
export async function verify_access_token(token: string) {
	return find_grant(token, 'access');
}

export async function create_upload_token(grant_id: string) {
	const time = now();
	const grant = await backend.get_oauth_grant(grant_id);
	if (!grant || grant.expires_at <= time)
		throw new Error('The MCP connection has ended. Connect again.');
	const expires_at = Math.min(time + UPLOAD_TOKEN_TTL_SECONDS, grant.expires_at);
	return { upload_token: await insert_token(grant_id, 'upload', expires_at), expires_at };
}

/** End every MCP connection, e.g. when the admin logs out. */
export async function revoke_all_grants() {
	await backend.revoke_oauth_grants();
}

/**
 * Allow an asset upload from an admin session or with an upload token from
 * prepare_image_upload. Token uploads come from agents, so the caller
 * validates their files more strictly.
 */
export async function authorize_asset_upload(
	request: Request,
	locals: { user?: unknown }
): Promise<'admin_session' | 'upload_token'> {
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) {
		require_user(locals);
		return 'admin_session';
	}
	if (!(await find_grant(token, 'upload')))
		error(401, 'The upload token is invalid or expired. Call prepare_image_upload for a new one.');
	return 'upload_token';
}

const MAX_OAUTH_BODY_BYTES = 16 * 1024;

/** The public OAuth endpoints read small bodies; refuse large ones before buffering them. */
export function assert_small_body(request: Request) {
	if (Number(request.headers.get('content-length')) > MAX_OAUTH_BODY_BYTES)
		throw new OAuthError('invalid_request', 'The request body is too large.', 413);
}

/** JSON response for the OAuth endpoints; tokens and metadata must not be cached. */
export function oauth_json(body: unknown, status = 200) {
	return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function oauth_error_response(err: unknown) {
	if (err instanceof OAuthError)
		return oauth_json({ error: err.code, error_description: err.message }, err.status);
	throw err;
}
