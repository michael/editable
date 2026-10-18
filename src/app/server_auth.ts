import type { RequestEvent } from '@sveltejs/kit';
import { backend } from './services.js';
import { site } from './server_site.js';
import {
	clear_admin_session_cookie,
	get_session_expires_at,
	log_in_admin,
	session_duration_seconds,
	session_cookie_name,
	session_renewal_interval_seconds,
	set_admin_session_cookie
} from '#lib/server/auth.js';

/** The fields the login dialog sends; Editable's own sends the password. */
export type Credentials = Record<string, string>;

export type LogInResult =
	{ ok: true; redirect?: string } | { ok: false; code: string; message: string };

/**
 * Whoever is signed in, as event.locals.user; signed-in users may edit the
 * site. Its shape is up to the auth that signs them in, and it reaches the
 * browser as page data, so keep secrets out of it.
 */
export type User = Record<string, unknown>;

/** The user Editable's admin password signs in. */
export const admin_user: User = { username: 'admin', name: 'Admin' };

/**
 * Who is signed in to a site, and how they sign in. Editable's default checks
 * the admin password. A host sets its own on event.locals.site, for example
 * one that takes a username from its own login dialog and continues with OAuth.
 */
export type Auth = {
	/** The user the request comes from, or null when nobody is signed in. */
	get_user(event: RequestEvent): User | null | Promise<User | null>;
	/**
	 * Sign in with what the login dialog sent. Return a redirect to continue
	 * elsewhere, such as an OAuth authorization page; event.url is the page
	 * the login started from.
	 */
	log_in(event: RequestEvent, credentials: Credentials): LogInResult | Promise<LogInResult>;
	log_out(event: RequestEvent): void | Promise<void>;
};

/** The current site's session cookie. */
const cookie_name = () => session_cookie_name(site.base);

/** The admin password from ADMIN_PASSWORD, with sliding sessions in the site's backend. */
export const password_auth: Auth = {
	async get_user({ cookies }) {
		const session_id = cookies.get(cookie_name());
		if (!session_id) return null;

		const row = await backend.get_session(session_id);
		const now = Math.floor(Date.now() / 1000);

		if (!row) {
			clear_admin_session_cookie(cookies, cookie_name());
			return null;
		}
		if (row.expires <= now) {
			await backend.delete_session(session_id);
			clear_admin_session_cookie(cookies, cookie_name());
			return null;
		}
		// Sliding renewal, at most once per renewal interval
		const last_renewed_at = row.expires - session_duration_seconds;
		if (now - last_renewed_at >= session_renewal_interval_seconds) {
			await backend.save_session({ session_id, expires: get_session_expires_at() });
			set_admin_session_cookie(cookies, cookie_name(), session_id);
		}
		return admin_user;
	},

	log_in({ cookies }, { password = '' }) {
		return log_in_admin(backend, cookies, cookie_name(), password);
	},

	async log_out({ cookies }) {
		const session_id = cookies.get(cookie_name());
		if (session_id) await backend.delete_session(session_id);
		clear_admin_session_cookie(cookies, cookie_name());
	}
};

/** The current request's site's auth; the admin password by default. */
export function get_auth(): Auth {
	return site.auth ?? password_auth;
}
