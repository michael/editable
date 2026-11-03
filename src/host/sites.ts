import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { error } from '@sveltejs/kit';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { NODE_ENV, ORIGIN } from '$app/env/private';
import { DATA_DIR } from '#app/server_config.js';
import { migrate } from '#app/migrations.js';
import { backend_for } from '#app/server_backend.js';
import type { Auth } from '#app/server_auth.js';
import { default_site } from '#app/server_site.js';
import type { Backend } from '#lib/server/backend.js';
import { open_sqlite } from '#lib/server/backends/sqlite_backend.js';
import { is_site_name } from './site_names.js';

/**
 * A minimal hosting service. The deployment's own site stays at ORIGIN, and
 * every hosted site is a subdomain of it: <name>.<host>. Sites are registered
 * with a name and a password in DATA_DIR/host.sqlite3, and each site's own
 * database and assets live in DATA_DIR/sites/<name>. A prototype, so no
 * email, rate limits, or recovery.
 */

const SESSION_SECONDS = 14 * 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);

// Read lazily: the build analyses this module without an ORIGIN.
const root = () => new URL(ORIGIN);

/** The public origin of a hosted site. */
export const site_origin = (name: string) => `${root().protocol}//${name}.${root().host}`;

let registry: DatabaseSync | undefined;

function get_registry() {
	if (!registry) {
		registry = open_sqlite(join(DATA_DIR, 'host.sqlite3'));
		registry.exec(
			'CREATE TABLE IF NOT EXISTS sites (name TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)'
		);
	}
	return registry;
}

export function site_exists(name: string) {
	return !!get_registry().prepare('SELECT 1 FROM sites WHERE name = ?').get(name);
}

const backends = new Map<string, Promise<Backend>>();

/** A site's backend, in DATA_DIR/sites/<name>, opened and migrated on first use and kept open. */
function open_backend(name: string): Promise<Backend> {
	let backend = backends.get(name);
	if (!backend) {
		backend = (async () => {
			const opened = backend_for(join(DATA_DIR, 'sites', name));
			await migrate(opened);
			return opened;
		})();
		// A failed opening is tried again on the next request.
		backend.catch(() => backends.delete(name));
		backends.set(name, backend);
	}
	return backend;
}

function hash_password(password: string, salt = randomBytes(16).toString('hex')) {
	return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function password_matches(password: string, stored: string) {
	const expected = Buffer.from(hash_password(password, stored.split(':')[0]));
	const actual = Buffer.from(stored);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Register a site and create its storage. Returns a message when the input is not acceptable. */
export async function create_site(name: string, password: string): Promise<string | null> {
	if (!is_site_name(name))
		return 'A site name is 3 to 30 lowercase letters, digits, and dashes, starting with a letter.';
	if (password.length < 8) return 'The password needs at least 8 characters.';
	if (site_exists(name)) return 'That site name is taken.';
	get_registry()
		.prepare('INSERT INTO sites (name, password_hash, created_at) VALUES (?, ?, ?)')
		.run(name, hash_password(password), now());
	await open_backend(name);
	return null;
}

// A browser is logged in as one site owner at a time: the cookie names the
// site and the session in that site's database, and is shared by the root
// and every site, so registering at the root lands on the new site logged in.
// Logging in elsewhere replaces it.
const SESSION_COOKIE = 'ew_site_session';
const cookie_options = () => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: NODE_ENV === 'production',
	// Browsers only share cookies across subdomains of a registrable domain, so
	// a local host such as localhost gets a host-only cookie.
	...(root().hostname.includes('.') && { domain: root().hostname })
});

function current_session(cookies: Cookies): { name: string; session_id: string } | null {
	const [name, session_id] = cookies.get(SESSION_COOKIE)?.split('.') ?? [];
	return name && session_id ? { name, session_id } : null;
}

export async function start_session(name: string, cookies: Cookies) {
	await end_session(cookies);
	const session_id = randomUUID();
	await (await open_backend(name)).save_session({ session_id, expires: now() + SESSION_SECONDS });
	cookies.set(SESSION_COOKIE, `${name}.${session_id}`, {
		...cookie_options(),
		maxAge: SESSION_SECONDS
	});
}

async function end_session(cookies: Cookies) {
	const session = current_session(cookies);
	if (session && site_exists(session.name))
		await (await open_backend(session.name)).delete_session(session.session_id);
	cookies.delete(SESSION_COOKIE, cookie_options());
}

/** Start a session for the site when the password is right. */
export async function log_in_site(name: string, password: string, cookies: Cookies) {
	const row = get_registry().prepare('SELECT password_hash FROM sites WHERE name = ?').get(name) as
		{ password_hash: string } | undefined;
	if (!row || !password_matches(password, row.password_hash)) return false;
	await start_session(name, cookies);
	return true;
}

/** The site's password, with sessions in the site's own backend. Its owner may edit it. */
function site_auth(name: string): Auth {
	return {
		async get_user({ cookies }) {
			const session = current_session(cookies);
			if (session?.name !== name) return null;
			const record = await (await open_backend(name)).get_session(session.session_id);
			if (record && record.expires > now()) return { username: name, name };
			await end_session(cookies);
			return null;
		},
		async log_in({ cookies }, { password = '' }) {
			if (!(await log_in_site(name, password, cookies)))
				return { ok: false, code: 'invalid_password', message: 'Incorrect password.' };
			return { ok: true };
		},
		async log_out({ cookies }) {
			await end_session(cookies);
		}
	};
}

/** The hosted site a request's hostname names, or null for the deployment's own site. */
function site_name_of({ url }: RequestEvent): string | null {
	const suffix = `.${root().host}`;
	return url.host.endsWith(suffix) ? url.host.slice(0, -suffix.length) : null;
}

/** Set the request's site before Editable's own handle runs. */
export const host_handle: Handle = async ({ event, resolve }) => {
	const name = site_name_of(event);
	if (name) {
		if (!is_site_name(name) || !site_exists(name)) error(404, 'There is no site with that name.');
		event.locals.site = {
			origin: site_origin(name),
			base: '',
			languages: [],
			// Until a site can choose its own, it is in the deployment's language.
			main_language: default_site.main_language,
			backend: await open_backend(name),
			auth: site_auth(name)
		};
	}
	return resolve(event);
};
