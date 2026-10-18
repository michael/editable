import { createHash, randomBytes } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { site } from './server_site.js';
import { require_user } from '#lib/server/auth.js';
import { backend } from './services.js';
import type { OAuthGrantRecord } from '#lib/server/backend.js';

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

/** Dynamic client registration (RFC 7591) for public clients. */
export async function register_client(input: { client_name?: unknown; redirect_uris?: unknown }) {
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
	const approved = new Set((await backend.oauth_grants.all()).map((grant) => grant.client_id));
	// Newest first; among equal times the later registration counts as newer.
	const pending = (await backend.oauth_clients.all())
		.filter((client) => !approved.has(client.client_id))
		.reverse()
		.sort((a, b) => b.created_at - a.created_at);
	for (const [index, client] of pending.entries()) {
		if (index >= MAX_PENDING_CLIENTS - 1 || client.created_at < now() - PENDING_CLIENT_TTL_SECONDS)
			await backend.oauth_clients.delete(client.client_id);
	}

	const client: OAuthClient = {
		client_id: new_secret(),
		client_name:
			typeof input.client_name === 'string' && input.client_name.trim()
				? input.client_name.trim().slice(0, 100)
				: 'Unnamed MCP client',
		redirect_uris
	};
	await backend.oauth_clients.put({ ...client, created_at: now() });
	return client;
}

export async function find_client(client_id: string): Promise<OAuthClient | null> {
	const record = await backend.oauth_clients.get(client_id);
	if (!record) return null;
	const { client_name, redirect_uris } = record;
	return { client_id, client_name, redirect_uris };
}

async function insert_token(grant_id: string, kind: TokenKind, expires_at: number) {
	const token = new_secret();
	await backend.oauth_tokens.put({ token_hash: hash(token), grant_id, kind, expires_at });
	return token;
}

/** The unexpired grant a token of the given kind belongs to. */
async function find_grant(token: string, kind: TokenKind): Promise<Grant | null> {
	const time = now();
	const record = await backend.oauth_tokens.get(hash(token));
	if (!record || record.kind !== kind || record.expires_at <= time) return null;
	const grant = await backend.oauth_grants.get(record.grant_id);
	return grant && grant.expires_at > time ? grant : null;
}

/** Record an admin's approval and return the authorization code for the client. */
export async function approve_client(input: {
	client_id: string;
	redirect_uri: string;
	code_challenge: string;
}) {
	const time = now();
	await backend.delete_expired(time);
	// A client's latest grant stays as its approval record; older ended ones go.
	for (const grant of await backend.oauth_grants.all())
		if (grant.client_id === input.client_id && grant.expires_at <= time)
			await backend.oauth_grants.delete(grant.grant_id);
	const grant_id = new_secret();
	await backend.oauth_grants.put({
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
 * refresh_token. Each exchange is one transaction, so a code or refresh token
 * can only be redeemed once.
 */
export async function exchange_token(params: URLSearchParams) {
	const client_id = params.get('client_id') ?? '';
	if (!is_own_resource(params.get('resource')))
		throw new OAuthError('invalid_target', `Tokens are only issued for ${mcp_resource()}.`);

	if (params.get('grant_type') === 'authorization_code') {
		const code = params.get('code') ?? '';
		const grant = await backend.transaction(async () => {
			const grant = await find_grant(code, 'code');
			// Codes are single use, whether or not the exchange succeeds.
			await backend.oauth_tokens.delete(hash(code));
			return grant;
		});
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
		return backend.transaction(async () => {
			const grant = await find_grant(refresh_token, 'refresh');
			if (!grant || grant.client_id !== client_id)
				throw new OAuthError(
					'invalid_grant',
					'The refresh token is invalid or the 48-hour approval has ended. Connect again.'
				);
			await backend.oauth_tokens.delete(hash(refresh_token));
			return issue_tokens(grant);
		});
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
	const grant = await backend.oauth_grants.get(grant_id);
	if (!grant || grant.expires_at <= time)
		throw new Error('The MCP connection has ended. Connect again.');
	const expires_at = Math.min(time + UPLOAD_TOKEN_TTL_SECONDS, grant.expires_at);
	return { upload_token: await insert_token(grant_id, 'upload', expires_at), expires_at };
}

/** End every MCP connection, e.g. when the admin logs out. Clients stay registered. */
export async function revoke_all_grants() {
	for (const token of await backend.oauth_tokens.all())
		await backend.oauth_tokens.delete(token.token_hash);
	for (const grant of await backend.oauth_grants.all())
		if (grant.expires_at > now()) await backend.oauth_grants.put({ ...grant, expires_at: now() });
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
