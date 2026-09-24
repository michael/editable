import { parse_languages, select_language } from '#app/languages.js';
import { LANG, ORIGIN, VERCEL } from '$app/env/private';
import { dev } from '$app/env';
import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit';
import {
	admin_session_cookie_name,
	clear_admin_session_cookie,
	get_session_expires_at,
	session_duration_seconds,
	session_renewal_interval_seconds,
	set_admin_session_cookie
} from '#lib/server/auth.js';

// Health checks and internal calls arrive without a forwarded host.
const internal_hostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// Parsed once at startup; a malformed ORIGIN disables the redirect.
const canonical_origin = parse_canonical_origin();

function parse_canonical_origin(): URL | null {
	if (!ORIGIN) return null;
	try {
		return new URL(ORIGIN);
	} catch {
		console.error(`Invalid ORIGIN, canonical host redirect disabled: ${ORIGIN}`);
		return null;
	}
}

/** Redirect target when the request host is not ORIGIN. */
function get_canonical_redirect(url: URL): string | null {
	if (VERCEL || dev || !canonical_origin) return null;
	if (internal_hostnames.has(url.hostname)) return null;
	if (url.host === canonical_origin.host && url.protocol === canonical_origin.protocol) return null;

	const target = new URL(url);
	target.protocol = canonical_origin.protocol;
	target.host = canonical_origin.host;
	return target.href;
}

export const init: ServerInit = async () => {
	if (!VERCEL) {
		const { run_migrations } = await import('#app/migrations.js');
		run_migrations();

		const { warn_about_shadowed_pages } = await import('#app/markdown/shadowed.js');
		warn_about_shadowed_pages();
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	// Navigations only. The target counts as external, so ORIGIN is allowlisted —
	// not `external: true`, which would permit redirecting anywhere.
	if (canonical_origin && (event.request.method === 'GET' || event.request.method === 'HEAD')) {
		const canonical_url = get_canonical_redirect(event.url);
		if (canonical_url) redirect(301, canonical_url, { external: [canonical_origin.origin] });
	}

	event.locals.is_admin = false;

	if (!VERCEL) {
		const session_id = event.cookies.get(admin_session_cookie_name);

		if (session_id) {
			const { db } = await import('#app/services.js');
			const row = db
				.prepare('SELECT expires FROM sessions WHERE session_id = ?')
				.get(session_id) as unknown as { expires: number } | undefined;

			const now = Math.floor(Date.now() / 1000);

			if (!row) {
				clear_admin_session_cookie(event.cookies);
			} else if (row.expires <= now) {
				db.prepare('DELETE FROM sessions WHERE session_id = ?').run(session_id);
				clear_admin_session_cookie(event.cookies);
			} else {
				// Sliding renewal, at most once per renewal interval
				const last_renewed_at = row.expires - session_duration_seconds;
				if (now - last_renewed_at >= session_renewal_interval_seconds) {
					db.prepare('UPDATE sessions SET expires = ? WHERE session_id = ?').run(
						get_session_expires_at(),
						session_id
					);
					set_admin_session_cookie(event.cookies, session_id);
				}
				event.locals.is_admin = true;
			}
		}
	}

	const languages = VERCEL ? [] : parse_languages(LANG);
	const language = languages.length
		? select_language(languages, event.url.searchParams.get('lang'))
		: '';
	const response = await resolve(
		event,
		languages.length
			? {
					transformPageChunk: ({ html }) =>
						html.replace('<html lang="en">', `<html lang="${language}">`)
				}
			: undefined
	);
	return response;
};
