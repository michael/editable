import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	ORIGIN: 'https://example.com',
	ADMIN_PASSWORD: 'secret',
	NODE_ENV: 'test'
}));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	return { db: new DatabaseSync(':memory:') };
});

import { db } from './services.js';
import migration from './migrations/20261010T180000000Z_editable_mcp_oauth.js';
import {
	approve_client,
	authorize_asset_upload,
	create_upload_token,
	exchange_token,
	find_client,
	is_allowed_redirect_uri,
	register_client,
	revoke_all_grants,
	verify_access_token
} from './server_oauth.js';

const redirect_uri = 'http://localhost:3000/callback';
const verifier = 'a'.repeat(43);
const code_challenge = createHash('sha256').update(verifier).digest('base64url');

beforeEach(() => {
	db.exec(
		'DROP TABLE IF EXISTS oauth_clients; DROP TABLE IF EXISTS oauth_grants; DROP TABLE IF EXISTS oauth_tokens'
	);
	migration.up({ db } as any);
});

afterEach(() => vi.useRealTimers());

function connect(client_id: string) {
	const code = approve_client({ client_id, redirect_uri, code_challenge });
	return exchange_token(
		new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id,
			redirect_uri,
			code_verifier: verifier,
			resource: 'https://example.com/mcp'
		})
	);
}

function refresh(client_id: string, refresh_token: string) {
	return exchange_token(
		new URLSearchParams({ grant_type: 'refresh_token', client_id, refresh_token })
	);
}

it('issues tokens for approved clients with PKCE and rotates refresh tokens', async () => {
	const { client_id } = register_client({
		client_name: 'Claude Code',
		redirect_uris: [redirect_uri]
	});
	expect(await find_client(client_id)).toMatchObject({ client_name: 'Claude Code' });

	const code = approve_client({ client_id, redirect_uri, code_challenge });
	const params = { grant_type: 'authorization_code', code, client_id, redirect_uri };
	expect(() => exchange_token(new URLSearchParams({ ...params, code_verifier: 'wrong' }))).toThrow(
		'invalid or expired'
	);
	// Codes are single use, even after a failed exchange.
	expect(() => exchange_token(new URLSearchParams({ ...params, code_verifier: verifier }))).toThrow(
		'invalid or expired'
	);

	const tokens = connect(client_id);
	expect(verify_access_token(tokens.access_token)).toMatchObject({ client_id });
	const refreshed = refresh(client_id, tokens.refresh_token);
	expect(verify_access_token(refreshed.access_token)).toMatchObject({ client_id });
	expect(() => refresh(client_id, tokens.refresh_token)).toThrow('Connect again');
	expect(() => refresh('another-client', refreshed.refresh_token)).toThrow('Connect again');
	expect(() =>
		exchange_token(new URLSearchParams({ ...params, resource: 'https://evil.example/mcp' }))
	).toThrow('only issued for https://example.com/mcp');
});

it('ends access after 48 hours or when the admin logs out', () => {
	vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') });
	const { client_id } = register_client({ redirect_uris: [redirect_uri] });
	const tokens = connect(client_id);
	const { grant_id } = verify_access_token(tokens.access_token)!;

	vi.setSystemTime(new Date('2026-10-12T11:00:00Z'));
	const late = refresh(client_id, tokens.refresh_token);
	expect(late.expires_in).toBe(3600);

	vi.setSystemTime(new Date('2026-10-12T12:00:01Z'));
	expect(verify_access_token(late.access_token)).toBeNull();
	expect(() => refresh(client_id, late.refresh_token)).toThrow('48-hour approval has ended');

	vi.useRealTimers();
	const fresh = connect(client_id);
	const { upload_token } = create_upload_token(verify_access_token(fresh.access_token)!.grant_id);
	const upload = (token: string) =>
		authorize_asset_upload(
			new Request('https://example.com/api/assets', {
				headers: { authorization: `Bearer ${token}` }
			}),
			{}
		);
	expect(upload(upload_token)).toBe('upload_token');

	revoke_all_grants();
	expect(verify_access_token(fresh.access_token)).toBeNull();
	expect(() => upload(upload_token)).toThrow();
	expect(() => create_upload_token(grant_id)).toThrow('has ended');
});

it('only accepts redirects to this computer or HTTPS', () => {
	expect(is_allowed_redirect_uri('http://127.0.0.1:8123/callback')).toBe(true);
	expect(is_allowed_redirect_uri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
	expect(is_allowed_redirect_uri('http://evil.example/callback')).toBe(false);
	expect(is_allowed_redirect_uri('https://example.com/callback#fragment')).toBe(false);
	expect(() => register_client({ redirect_uris: ['http://evil.example/callback'] })).toThrow(
		'localhost or HTTPS'
	);
});

it('reads clients from their metadata documents', async () => {
	const client_id = 'https://app.example/oauth/client.json';
	const metadata = { client_id, client_name: 'Example', redirect_uris: [redirect_uri] };
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json(metadata))
	);
	expect(await find_client(client_id)).toEqual(metadata);

	vi.stubGlobal(
		'fetch',
		vi.fn(async () => Response.json({ ...metadata, client_id: 'https://other' }))
	);
	expect(await find_client(client_id)).toBeNull();
	vi.unstubAllGlobals();
});
