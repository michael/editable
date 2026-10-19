import type { Auth } from '#app/server_auth.js';
import { site } from '#app/server_site.js';
import { clear_session_cookie, session_cookie_name, set_session_cookie } from '#lib/server/auth.js';
import {
	account_for_session,
	check_password,
	end_session,
	start_session,
	type Account
} from './store.js';

const cookie_name = () => session_cookie_name('meter_readings', site.base);

/**
 * Sign-in for the meter readings app: everyone with an account signs in with
 * a username and password through the site's login dialog, and only editors
 * may edit the website.
 */
export const meter_readings_auth: Auth = {
	async get_user({ cookies }) {
		const session_id = cookies.get(cookie_name());
		return session_id ? account_for_session(session_id) : null;
	},

	async log_in({ cookies }, { username = '', password = '' }) {
		const account = await check_password(username.trim().toLowerCase(), password);
		if (!account)
			return { ok: false, code: 'invalid_credentials', message: 'Unknown user or wrong password.' };
		const { session_id, max_age } = await start_session(account.username);
		set_session_cookie(cookies, cookie_name(), session_id, max_age);
		return { ok: true };
	},

	async log_out({ cookies }) {
		const session_id = cookies.get(cookie_name());
		if (session_id) await end_session(session_id);
		clear_session_cookie(cookies, cookie_name());
	},

	is_editor: (user) => (user as Account).role === 'editor'
};
