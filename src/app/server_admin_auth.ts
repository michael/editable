import type { RequestEvent } from '@sveltejs/kit';
import { store } from './services.js';
import { site } from './server_site.js';
import {
	admin_session_cookie_name,
	clear_admin_session_cookie,
	delete_session,
	get_session_expires_at,
	log_in_admin,
	session_duration_seconds,
	session_renewal_interval_seconds,
	set_admin_session_cookie
} from '#lib/server/auth.js';

/** The fields the login dialog sends; Editable's own sends the password. */
export type Credentials = Record<string, string>;

export type LogInResult =
	{ ok: true; redirect?: string } | { ok: false; code: string; message: string };

/**
 * Who may edit a site, and how they sign in. Editable's default checks the
 * admin password. A host sets its own on event.locals.site, for example one
 * that takes a username from its own login dialog and continues with OAuth.
 */
export type AdminAuth = {
	/** Whether the request comes from an admin of its site. */
	is_admin(event: RequestEvent): boolean | Promise<boolean>;
	/**
	 * Sign in with what the login dialog sent. Return a redirect to continue
	 * elsewhere, such as an OAuth authorization page; event.url is the page
	 * the login started from.
	 */
	log_in(event: RequestEvent, credentials: Credentials): LogInResult | Promise<LogInResult>;
	log_out(event: RequestEvent): void | Promise<void>;
};

/** The admin password from ADMIN_PASSWORD, with sliding sessions in the site's database. */
export const password_auth: AdminAuth = {
	is_admin({ cookies }) {
		const session_id = cookies.get(admin_session_cookie_name);
		if (!session_id) return false;

		const row = store.sessions.get(session_id);
		const now = Math.floor(Date.now() / 1000);

		if (!row) {
			clear_admin_session_cookie(cookies);
			return false;
		}
		if (row.expires <= now) {
			store.sessions.delete(session_id);
			clear_admin_session_cookie(cookies);
			return false;
		}
		// Sliding renewal, at most once per renewal interval
		const last_renewed_at = row.expires - session_duration_seconds;
		if (now - last_renewed_at >= session_renewal_interval_seconds) {
			store.sessions.put(session_id, { session_id, expires: get_session_expires_at() });
			set_admin_session_cookie(cookies, session_id);
		}
		return true;
	},

	log_in({ cookies }, { password = '' }) {
		return log_in_admin(store, cookies, password);
	},

	async log_out({ cookies }) {
		const session_id = cookies.get(admin_session_cookie_name);
		if (session_id) await delete_session(session_id, store);
		clear_admin_session_cookie(cookies);
	}
};

/** The current request's site's admin auth; the admin password by default. */
export function get_admin_auth(): AdminAuth {
	return site.auth ?? password_auth;
}
