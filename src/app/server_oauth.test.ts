import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({
	ORIGIN: 'https://example.com',
	LANGUAGES: '',
	VERCEL: undefined,
	ADMIN_PASSWORD: 'secret',
	NODE_ENV: 'test'
}));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { sqlite_backend } = await import('#lib/server/backends/sqlite_backend.js');
	const sqlite = new DatabaseSync(':memory:');
	const asset_dir = mkdtempSync(`${tmpdir()}/editable-assets-`);
	return { sqlite, backend: sqlite_backend({ db: sqlite, asset_dir }) };
});

import type { DatabaseSync } from 'node:sqlite';
import * as services from './services.js';
const { sqlite } = services as unknown as { sqlite: DatabaseSync };
import migration from '#app/migrations/sqlite/20261010T180000000Z_editable_mcp_oauth.js';
import initial_schema from '#app/migrations/sqlite/20260803T131059242Z_editable_initial_schema.js';
import {
	approve_client,
	assert_small_body,
	authorize_asset_upload,
	create_upload_token,
	exchange_token,
	find_client,
	is_allowed_redirect_uri,
	register_client,
	revoke_all_grants,
	verify_access_token
} from './server_oauth.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

const redirect_uri = 'http://localhost:3000/callback';
const verifier = 'a'.repeat(43);
const code_challenge = createHash('sha256').update(verifier).digest('base64url');

initial_schema.up({ db: sqlite } as SqliteStorage);

beforeEach(() => {
	sqlite.exec('DROP TABLE IF EXISTS oauth_grants; DROP TABLE IF EXISTS oauth_tokens');
	migration.up({ db: sqlite } as SqliteStorage);
});

afterEach(() => vi.useRealTimers());

async function connect(client_id: string) {
	const code = await approve_client({ client_id, redirect_uri, code_challenge });
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
	expect(find_client(client_id)).toMatchObject({ client_name: 'Claude Code' });

	const code = await approve_client({ client_id, redirect_uri, code_challenge });
	const params = { grant_type: 'authorization_code', code, client_id, redirect_uri };
	await expect(
		exchange_token(new URLSearchParams({ ...params, code_verifier: 'wrong' }))
	).rejects.toThrow('invalid or expired');
	// Codes are single use, even after a failed exchange.
	await expect(
		exchange_token(new URLSearchParams({ ...params, code_verifier: verifier }))
	).rejects.toThrow('invalid or expired');

	const tokens = await connect(client_id);
	expect(await verify_access_token(tokens.access_token)).toMatchObject({ client_id });
	const refreshed = await refresh(client_id, tokens.refresh_token);
	expect(await verify_access_token(refreshed.access_token)).toMatchObject({ client_id });
	await expect(refresh(client_id, tokens.refresh_token)).rejects.toThrow('Connect again');
	const another = register_client({ redirect_uris: ['http://localhost:4000/callback'] });
	await expect(refresh(another.client_id, refreshed.refresh_token)).rejects.toThrow(
		'Connect again'
	);
	await expect(
		exchange_token(new URLSearchParams({ ...params, resource: 'https://evil.example/mcp' }))
	).rejects.toThrow('only issued for https://example.com/mcp');
});

it('redeems a code only once, even when two exchanges race', async () => {
	const { client_id } = register_client({ redirect_uris: [redirect_uri] });
	const code = await approve_client({ client_id, redirect_uri, code_challenge });
	const exchange = () =>
		exchange_token(
			new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				client_id,
				redirect_uri,
				code_verifier: verifier
			})
		);
	const results = await Promise.allSettled([exchange(), exchange()]);
	expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
});

it('ends access after 48 hours or when the admin logs out', async () => {
	vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') });
	const { client_id } = register_client({ redirect_uris: [redirect_uri] });
	const tokens = await connect(client_id);
	const { grant_id } = (await verify_access_token(tokens.access_token))!;

	vi.setSystemTime(new Date('2026-10-12T11:00:00Z'));
	const late = await refresh(client_id, tokens.refresh_token);
	expect(late.expires_in).toBe(3600);

	vi.setSystemTime(new Date('2026-10-12T12:00:01Z'));
	expect(await verify_access_token(late.access_token)).toBeNull();
	await expect(refresh(client_id, late.refresh_token)).rejects.toThrow(
		'48-hour approval has ended'
	);

	vi.useRealTimers();
	const fresh = await connect(client_id);
	const { upload_token } = await create_upload_token(
		(await verify_access_token(fresh.access_token))!.grant_id
	);
	const upload = (token: string) =>
		authorize_asset_upload(
			new Request('https://example.com/api/assets', {
				headers: { authorization: `Bearer ${token}` }
			}),
			{}
		);
	expect(await upload(upload_token)).toBe('upload_token');

	await revoke_all_grants();
	expect(await verify_access_token(fresh.access_token)).toBeNull();
	await expect(upload(upload_token)).rejects.toThrow();
	await expect(create_upload_token(grant_id)).rejects.toThrow('has ended');
});

it('refuses oversized bodies before reading them', () => {
	const request = (length: number) =>
		new Request('https://example.com/oauth/register', {
			method: 'POST',
			headers: { 'content-length': String(length) }
		});
	expect(() => assert_small_body(request(1024))).not.toThrow();
	expect(() => assert_small_body(request(1024 * 1024))).toThrow('too large');
});

it('only accepts redirects to this computer or HTTPS', async () => {
	expect(is_allowed_redirect_uri('http://127.0.0.1:8123/callback')).toBe(true);
	expect(is_allowed_redirect_uri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
	expect(is_allowed_redirect_uri('http://evil.example/callback')).toBe(false);
	expect(is_allowed_redirect_uri('https://example.com/callback#fragment')).toBe(false);
	expect(() => register_client({ redirect_uris: ['http://evil.example/callback'] })).toThrow(
		'localhost or HTTPS'
	);
});

it('stores no registrations: a client_id carries its own', async () => {
	const client = register_client({ client_name: 'Claude', redirect_uris: [redirect_uri] });
	expect(find_client(client.client_id)).toEqual(client);
	await connect(client.client_id);

	// A client_id from before, or made up, makes the client register again.
	const unknown = 'v06ot0c6l3AelbrLEtk_D77NMhW_DYCyatdFfDqE3wI';
	expect(find_client(unknown)).toBeNull();
	const crafted = (registration: object) =>
		Buffer.from(JSON.stringify(registration)).toString('base64url');
	expect(
		find_client(crafted({ client_name: 'x'.repeat(500), redirect_uris: [redirect_uri] }))
	).toBeNull();
	expect(
		find_client(crafted({ client_name: 'Evil', redirect_uris: ['http://evil.example/callback'] }))
	).toBeNull();
	await expect(refresh(unknown, 'token')).rejects.toMatchObject({
		code: 'invalid_client',
		status: 401
	});
});
