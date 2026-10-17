import { expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';

const request = vi.hoisted(() => ({ locals: {} as Record<string, unknown> }));
vi.mock('$app/env/private', () => ({
	ADMIN_PASSWORD: 'secret',
	NODE_ENV: 'test',
	ORIGIN: 'https://example.com',
	LANGUAGES: '',
	VERCEL: ''
}));
vi.mock('$app/server', () => ({ getRequestEvent: () => ({ locals: request.locals }) }));
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
import initial_schema from '#app/migrations/20260803T131059242Z_editable_initial_schema.js';
import throttle_schema from '#app/migrations/20261017T120000000Z_editable_login_throttle_sqlite.js';
import { get_admin_auth, password_auth, type AdminAuth } from './server_admin_auth.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

initial_schema.up({ db: sqlite } as SqliteStorage);
throttle_schema.up({ db: sqlite } as SqliteStorage);

/** A request with a cookie jar, enough for the auth functions. */
function event_with_cookies(jar = new Map<string, string>()) {
	const cookies = {
		get: (name: string) => jar.get(name),
		set: (name: string, value: string, { maxAge }: { maxAge?: number }) =>
			maxAge === 0 ? jar.delete(name) : jar.set(name, value)
	};
	return { cookies, url: new URL('https://example.com/about') } as unknown as RequestEvent;
}

it('signs in with the admin password by default', async () => {
	const event = event_with_cookies();
	expect(get_admin_auth()).toBe(password_auth);
	expect(await get_admin_auth().is_admin(event)).toBe(false);

	expect(await password_auth.log_in(event, { password: 'wrong' })).toMatchObject({
		ok: false,
		code: 'invalid_password'
	});
	expect(await password_auth.log_in(event, { password: 'secret' })).toEqual({ ok: true });
	expect(await password_auth.is_admin(event)).toBe(true);

	await password_auth.log_out(event);
	expect(await password_auth.is_admin(event)).toBe(false);
	expect(sqlite.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
});

it('uses the admin auth a host sets for the request', async () => {
	const host_auth: AdminAuth = {
		is_admin: () => true,
		log_in: (event, { username }) => ({
			ok: true,
			redirect: `https://auth.example/authorize?login_hint=${username}&from=${event.url.pathname}`
		}),
		log_out: () => {}
	};
	request.locals = { site: { origin: '', base: '', languages: [], auth: host_auth } };
	const auth = get_admin_auth();
	expect(auth).toBe(host_auth);
	expect(await auth.log_in(event_with_cookies(), { username: 'alice.example' })).toEqual({
		ok: true,
		redirect: 'https://auth.example/authorize?login_hint=alice.example&from=/about'
	});
	request.locals = {};
});
