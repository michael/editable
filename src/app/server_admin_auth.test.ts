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
	const { sqlite_store } = await import('#lib/server/storage/sqlite.js');
	const db = new DatabaseSync(':memory:');
	return { db, store: sqlite_store(db, (fn) => fn()) };
});

import type { DatabaseSync } from 'node:sqlite';
import * as services from './services.js';
const { db } = services as unknown as { db: DatabaseSync };
import initial_schema from '#app/migrations/20260803T131059242Z_editable_initial_schema.js';
import { get_admin_auth, password_auth, type AdminAuth } from './server_admin_auth.js';

initial_schema.up({ db });

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
	expect(get_admin_auth().is_admin(event)).toBe(false);

	expect(await password_auth.log_in(event, { password: 'wrong' })).toMatchObject({
		ok: false,
		code: 'invalid_password'
	});
	expect(await password_auth.log_in(event, { password: 'secret' })).toEqual({ ok: true });
	expect(password_auth.is_admin(event)).toBe(true);

	await password_auth.log_out(event);
	expect(password_auth.is_admin(event)).toBe(false);
	expect(db.prepare('SELECT count(*) AS n FROM sessions').get()).toEqual({ n: 0 });
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
