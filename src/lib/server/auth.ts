import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Cookies } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { ADMIN_PASSWORD, NODE_ENV } from '$app/env/private';

export const admin_session_cookie_name = 'ew_admin_session';
export const session_duration_seconds = 14 * 24 * 60 * 60;

// Sliding sessions are renewed at most once per interval, not on every
// request — a page load with dozens of asset requests must not write to the
// sessions table dozens of times.
export const session_renewal_interval_seconds = 24 * 60 * 60;

// Login throttle: the first `free_attempts` failures are free, then each
// failure locks login for `base_lockout_seconds`, doubling per failure up to
// `max_lockout_seconds`. Global (there is only one admin), persisted in
// site_settings so restarts don't reset it.
const LOGIN_THROTTLE = {
	free_attempts: 5,
	base_lockout_seconds: 30,
	max_lockout_seconds: 3600
};

const LOGIN_THROTTLE_KEY = 'login_throttle';

/**
 * Constant-time password comparison over SHA-256 digests.
 */
export function passwords_match(a: string, b: string): boolean {
	const digest = (s: string) => crypto.createHash('sha256').update(s).digest();
	return crypto.timingSafeEqual(digest(a), digest(b));
}

function get_login_throttle_state(db: DatabaseSync): {
	failed_count: number;
	locked_until: number;
} {
	const row = db
		.prepare('SELECT value FROM site_settings WHERE key = ?')
		.get(LOGIN_THROTTLE_KEY) as { value: string } | undefined;

	return row ? JSON.parse(row.value) : { failed_count: 0, locked_until: 0 };
}

function set_login_throttle_state(
	db: DatabaseSync,
	state: { failed_count: number; locked_until: number }
) {
	db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)').run(
		LOGIN_THROTTLE_KEY,
		JSON.stringify(state)
	);
}

/**
 * Seconds until login attempts are accepted again (0 when unlocked).
 */
export function get_login_lockout_seconds(db: DatabaseSync): number {
	const { locked_until } = get_login_throttle_state(db);
	return Math.max(locked_until - Math.floor(Date.now() / 1000), 0);
}

export function register_failed_login(db: DatabaseSync) {
	const state = get_login_throttle_state(db);
	state.failed_count += 1;

	const throttled_failures = state.failed_count - LOGIN_THROTTLE.free_attempts;
	if (throttled_failures >= 0) {
		const lockout_seconds = Math.min(
			LOGIN_THROTTLE.base_lockout_seconds * 2 ** throttled_failures,
			LOGIN_THROTTLE.max_lockout_seconds
		);
		state.locked_until = Math.floor(Date.now() / 1000) + lockout_seconds;
	}

	set_login_throttle_state(db, state);
}

export function reset_login_throttle(db: DatabaseSync) {
	set_login_throttle_state(db, { failed_count: 0, locked_until: 0 });
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

export function clear_admin_session_cookie(cookies: Cookies) {
	cookies.set(admin_session_cookie_name, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: 0
	});
}

export function set_admin_session_cookie(cookies: Cookies, session_id: string) {
	cookies.set(admin_session_cookie_name, session_id, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: NODE_ENV === 'production',
		maxAge: session_duration_seconds
	});
}

export async function delete_session(session_id: string, db: DatabaseSync) {
	db.prepare('DELETE FROM sessions WHERE session_id = ?').run(session_id);
}

export function require_admin_session(locals: { is_admin?: boolean }) {
	if (!locals.is_admin) {
		error(401, 'Unauthorized');
	}
}

function format_lockout_duration(seconds: number): string {
	if (seconds < 60) return `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Start an admin session for a correct password, subject to the login throttle. */
export function log_in_admin(
	db: DatabaseSync,
	cookies: Cookies,
	password: string
): { ok: true } | { ok: false; code: string; message: string } {
	const lockout_seconds = get_login_lockout_seconds(db);
	if (lockout_seconds > 0) {
		return {
			ok: false,
			code: 'too_many_attempts',
			message: `Too many attempts. Try again in ${format_lockout_duration(lockout_seconds)}.`
		};
	}

	if (!passwords_match(password, get_required_admin_password())) {
		register_failed_login(db);
		return { ok: false, code: 'invalid_password', message: 'Incorrect admin password.' };
	}

	reset_login_throttle(db);

	const session_id = crypto.randomUUID();
	db.prepare('INSERT INTO sessions (session_id, expires) VALUES (?, ?)').run(
		session_id,
		get_session_expires_at()
	);
	set_admin_session_cookie(cookies, session_id);
	return { ok: true };
}
