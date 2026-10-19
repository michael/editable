import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dev } from '$app/env';
import { get_backend } from '#app/services.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

/** Someone with an account in the meter readings app. Only editors may edit the website. */
export type Account = { username: string; name: string; role: 'editor' | 'reader' };
export type Reading = { id: number; meter: string; value: number; read_at: string };

const SESSION_SECONDS = 14 * 24 * 60 * 60;

// Demo accounts, added in development to an empty account table: Anna edits
// the website, Ben only reports readings. Their passwords are anna-demo and ben-demo.
const DEMO_ACCOUNTS = [
	{ username: 'anna', name: 'Anna', role: 'editor', password: 'anna-demo' },
	{ username: 'ben', name: 'Ben', role: 'reader', password: 'ben-demo' }
] as const;

let seeded = false;

/**
 * The site's own database: the app's tables live next to Editable's records,
 * created by the custom_meter_readings storage migration. The app is built on
 * the SQLite backend.
 */
async function database() {
	const { db } = (await get_backend()).storage as SqliteStorage;
	if (dev && !seeded) {
		seeded = true;
		if (!db.prepare('SELECT 1 FROM meter_accounts').get()) {
			const insert = db.prepare('INSERT INTO meter_accounts VALUES (?, ?, ?, ?)');
			for (const account of DEMO_ACCOUNTS)
				insert.run(account.username, account.name, account.role, hash_password(account.password));
		}
	}
	return db;
}

function hash_password(password: string) {
	const salt = randomBytes(16).toString('hex');
	return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

function password_matches(password: string, stored: string) {
	const [salt, hash] = stored.split(':');
	return timingSafeEqual(scryptSync(password, salt, 32), Buffer.from(hash, 'hex'));
}

const now = () => Math.floor(Date.now() / 1000);

/** The account with this username and password, or null. */
export async function check_password(username: string, password: string): Promise<Account | null> {
	const row = (await database())
		.prepare('SELECT username, name, role, password_hash FROM meter_accounts WHERE username = ?')
		.get(username) as (Account & { password_hash: string }) | undefined;
	if (!row || !password_matches(password, row.password_hash)) return null;
	const { password_hash: _, ...account } = row;
	return account;
}

export async function start_session(username: string) {
	const session_id = randomUUID();
	(await database())
		.prepare('INSERT INTO meter_sessions VALUES (?, ?, ?)')
		.run(session_id, username, now() + SESSION_SECONDS);
	return { session_id, max_age: SESSION_SECONDS };
}

/** The account a session belongs to, while it lasts. */
export async function account_for_session(session_id: string): Promise<Account | null> {
	const row = (await database())
		.prepare(
			`SELECT meter_accounts.username, meter_accounts.name, meter_accounts.role
			FROM meter_sessions JOIN meter_accounts USING (username)
			WHERE session_id = ? AND expires > ?`
		)
		.get(session_id, now()) as Account | undefined;
	return row ? { ...row } : null;
}

export async function end_session(session_id: string) {
	(await database()).prepare('DELETE FROM meter_sessions WHERE session_id = ?').run(session_id);
}

export async function add_reading(username: string, meter: string, value: number) {
	(await database())
		.prepare('INSERT INTO meter_readings (username, meter, value, read_at) VALUES (?, ?, ?, ?)')
		.run(username, meter, value, new Date().toISOString());
}

/** An account's readings, newest first. */
export async function readings_of(username: string): Promise<Reading[]> {
	return (await database())
		.prepare(
			'SELECT id, meter, value, read_at FROM meter_readings WHERE username = ? ORDER BY id DESC LIMIT 50'
		)
		.all(username)
		.map((row) => ({ ...row }) as Reading);
}
