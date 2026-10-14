import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { error } from '@sveltejs/kit';
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { NODE_ENV, ORIGIN } from '$app/env/private';
import { ASSET_ID_REGEX } from '#app/config.js';
import { ASSET_GRACE_PERIOD_DAYS, DATA_DIR } from '#app/server_config.js';
import { run_migrations } from '#app/migrations.js';
import type { SiteStorage } from '#app/services.js';
import type { AdminAuth } from '#app/server_admin_auth.js';
import { create_database } from '#lib/server/db.js';
import { create_asset_storage } from '#lib/server/asset_storage.js';
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

const root = new URL(ORIGIN);

/** The public origin of a hosted site. */
export const site_origin = (name: string) => `${root.protocol}//${name}.${root.host}`;

let registry: DatabaseSync | undefined;

function get_registry() {
	if (!registry) {
		registry = create_database({ data_dir: DATA_DIR, db_path: join(DATA_DIR, 'host.sqlite3') }).db;
		registry.exec(
			'CREATE TABLE IF NOT EXISTS sites (name TEXT PRIMARY KEY, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL)'
		);
	}
	return registry;
}

export function site_exists(name: string) {
	return !!get_registry().prepare('SELECT 1 FROM sites WHERE name = ?').get(name);
}

const storages = new Map<string, SiteStorage>();

/** A site's storage, opened and migrated on first use and kept open. */
function open_storage(name: string): SiteStorage {
	let storage = storages.get(name);
	if (!storage) {
		const dir = join(DATA_DIR, 'sites', name);
		const { db, with_transaction } = create_database({
			data_dir: dir,
			db_path: join(dir, 'db.sqlite3')
		});
		const assets = create_asset_storage({
			asset_path: join(dir, 'assets'),
			asset_grace_period_days: ASSET_GRACE_PERIOD_DAYS,
			asset_id_regex: ASSET_ID_REGEX
		});
		storage = { db, with_transaction, assets };
		run_migrations(storage);
		storages.set(name, storage);
	}
	return storage;
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
export function create_site(name: string, password: string): string | null {
	if (!is_site_name(name))
		return 'A site name is 3 to 30 lowercase letters, digits, and dashes, starting with a letter.';
	if (password.length < 8) return 'The password needs at least 8 characters.';
	if (site_exists(name)) return 'That site name is taken.';
	get_registry()
		.prepare('INSERT INTO sites (name, password_hash, created_at) VALUES (?, ?, ?)')
		.run(name, hash_password(password), now());
	open_storage(name);
	return null;
}

// A browser is logged in as one site owner at a time: the cookie names the
// site and the session in that site's database, and is shared by the root
// and every site, so registering at the root lands on the new site logged in.
// Logging in elsewhere replaces it.
const SESSION_COOKIE = 'ew_site_session';
const cookie_options = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: NODE_ENV === 'production',
	// Browsers only share cookies across subdomains of a registrable domain, so
	// a local host such as localhost gets a host-only cookie.
	...(root.hostname.includes('.') && { domain: root.hostname })
};

function current_session(cookies: Cookies): { name: string; session_id: string } | null {
	const [name, session_id] = cookies.get(SESSION_COOKIE)?.split('.') ?? [];
	return name && session_id ? { name, session_id } : null;
}

export function start_session(name: string, cookies: Cookies) {
	end_session(cookies);
	const session_id = randomUUID();
	open_storage(name)
		.db.prepare('INSERT INTO sessions (session_id, expires) VALUES (?, ?)')
		.run(session_id, now() + SESSION_SECONDS);
	cookies.set(SESSION_COOKIE, `${name}.${session_id}`, {
		...cookie_options,
		maxAge: SESSION_SECONDS
	});
}

function end_session(cookies: Cookies) {
	const session = current_session(cookies);
	if (session && site_exists(session.name))
		open_storage(session.name)
			.db.prepare('DELETE FROM sessions WHERE session_id = ?')
			.run(session.session_id);
	cookies.delete(SESSION_COOKIE, cookie_options);
}

/** Start a session for the site when the password is right. */
export function log_in_site(name: string, password: string, cookies: Cookies) {
	const row = get_registry().prepare('SELECT password_hash FROM sites WHERE name = ?').get(name) as
		{ password_hash: string } | undefined;
	if (!row || !password_matches(password, row.password_hash)) return false;
	start_session(name, cookies);
	return true;
}

/** The site's password, with sessions in the site's own database. */
function site_auth(name: string): AdminAuth {
	return {
		is_admin({ cookies }) {
			const session = current_session(cookies);
			if (session?.name !== name) return false;
			const row = open_storage(name)
				.db.prepare('SELECT expires FROM sessions WHERE session_id = ?')
				.get(session.session_id) as { expires: number } | undefined;
			if (row && row.expires > now()) return true;
			end_session(cookies);
			return false;
		},
		log_in({ cookies }, { password = '' }) {
			if (!log_in_site(name, password, cookies))
				return { ok: false, code: 'invalid_password', message: 'Incorrect password.' };
			return { ok: true };
		},
		log_out({ cookies }) {
			end_session(cookies);
		}
	};
}

/** The hosted site a request's hostname names, or null for the deployment's own site. */
function site_name_of({ url }: RequestEvent): string | null {
	const suffix = `.${root.host}`;
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
			storage: open_storage(name),
			auth: site_auth(name)
		};
	}
	return resolve(event);
};
