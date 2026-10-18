import crypto from 'node:crypto';
import type { Backend } from './backend.js';
import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { ADMIN_PASSWORD, NODE_ENV } from '$app/env/private';

/** The records auth keeps: sessions and the login throttle. */
type AuthRecords = Pick<
	Backend,
	'save_session' | 'get_login_throttle' | 'save_login_throttle' | 'delete_expired'
>;

/**
 * The session cookie of the site served under base: ew_admin_session at the
 * root, with the base appended under a path, so sites sharing an origin keep
 * their sign-ins apart.
 */
export function session_cookie_name(base: string) {
	return base ? `ew_admin_session_${base.slice(1).replace(/[^\w-]/g, '_')}` : 'ew_admin_session';
}
export const session_duration_seconds = 14 * 24 * 60 * 60;

// Sliding sessions are renewed at most once per interval, not on every
// request — a page load with dozens of asset requests must not write to the
// sessions table dozens of times.
export const session_renewal_interval_seconds = 24 * 60 * 60;

// Login throttle: the first `free_attempts` failures are free, then each
// failure locks login for `base_lockout_seconds`, doubling per failure up to
// `max_lockout_seconds`. Global (there is only one admin), persisted in
// the login_throttle collection so restarts don't reset it.
const LOGIN_THROTTLE = {
	free_attempts: 5,
	base_lockout_seconds: 30,
	max_lockout_seconds: 3600
};

const LOGIN_THROTTLE_KEY = 'admin';

/**
 * Constant-time password comparison over SHA-256 digests.
 */
export function passwords_match(a: string, b: string): boolean {
	const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
	return crypto.timingSafeEqual(digest(a), digest(b));
}

async function get_login_throttle_state(records: AuthRecords) {
	const state = await records.get_login_throttle(LOGIN_THROTTLE_KEY);
	return state ?? { key: LOGIN_THROTTLE_KEY, failed_count: 0, locked_until: 0 };
}

/**
 * Seconds until login attempts are accepted again (0 when unlocked).
 */
export async function get_login_lockout_seconds(records: AuthRecords): Promise<number> {
	const { locked_until } = await get_login_throttle_state(records);
	return Math.max(locked_until - Math.floor(Date.now() / 1000), 0);
}

export async function register_failed_login(records: AuthRecords) {
	const state = await get_login_throttle_state(records);
	state.failed_count += 1;

	const throttled_failures = state.failed_count - LOGIN_THROTTLE.free_attempts;
	if (throttled_failures >= 0) {
		const lockout_seconds = Math.min(
			LOGIN_THROTTLE.base_lockout_seconds * 2 ** throttled_failures,
			LOGIN_THROTTLE.max_lockout_seconds
		);
		state.locked_until = Math.floor(Date.now() / 1000) + lockout_seconds;
	}

	await records.save_login_throttle(state);
}

export async function reset_login_throttle(records: AuthRecords) {
	await records.save_login_throttle({ key: LOGIN_THROTTLE_KEY, failed_count: 0, locked_until: 0 });
}

export function get_required_admin_password(): string {
	const admin_password = ADMIN_PASSWORD;
	if (!admin_password) {
		throw new Error('ADMIN_PASSWORD must be set');
	}

	return admin_password;
}

export function get_session_expires_at(): number {
	return Math.floor(Date.now() / 1000) + session_duration_seconds;
}

export function clear_admin_session_cookie(cookies: Cookies, name: string) {
	cookies.set(name, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: 0
	});
}

export function set_admin_session_cookie(cookies: Cookies, name: string, session_id: string) {
	cookies.set(name, session_id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: session_duration_seconds
	});
}

/** The signed-in user, or a 401 when nobody is signed in. */
export function require_user<User>(locals: { user?: User | null }): User {
	if (!locals.user) error(401, 'Unauthorized');
	return locals.user;
}

function format_lockout_duration(seconds: number): string {
	if (seconds < 60) return `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Start an admin session for a correct password, subject to the login throttle. */
export async function log_in_admin(
	records: AuthRecords,
	cookies: Cookies,
	cookie_name: string,
	password: string
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
	const lockout_seconds = await get_login_lockout_seconds(records);
	if (lockout_seconds > 0) {
		return {
			ok: false,
			code: 'too_many_attempts',
			message: `Too many attempts. Try again in ${format_lockout_duration(lockout_seconds)}.`
		};
	}

	if (!passwords_match(password, get_required_admin_password())) {
		await register_failed_login(records);
		return { ok: false, code: 'invalid_password', message: 'Incorrect admin password.' };
	}

	await reset_login_throttle(records);
	await records.delete_expired(Math.floor(Date.now() / 1000));

	const session_id = crypto.randomUUID();
	await records.save_session({ session_id, expires: get_session_expires_at() });
	set_admin_session_cookie(cookies, cookie_name, session_id);
	return { ok: true };
}
