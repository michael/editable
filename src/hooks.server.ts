import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { site, request_language, type Site } from '#app/server_site.js';
import { normalize_href, resolve_href } from '#app/document_links.js';
import { ORIGIN, VERCEL } from '$app/env/private';
import { dev } from '$app/env';

// Health checks and internal calls arrive without a forwarded host.
const internal_hostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// A malformed origin disables the redirect.
if (ORIGIN && !URL.parse(ORIGIN))
	console.error(`Invalid ORIGIN, canonical host redirect disabled: ${ORIGIN}`);

/** Redirect target when the request host is not the site's origin. */
function get_canonical_redirect(url: URL, canonical_origin: URL, site: Site): string | null {
	if (VERCEL || dev) return null;
	if (internal_hostnames.has(url.hostname)) return null;
	if (url.host === canonical_origin.host && url.protocol === canonical_origin.protocol) return null;

	const target = new URL(url);
	target.protocol = canonical_origin.protocol;
	target.host = canonical_origin.host;
	target.pathname = resolve_href(url.pathname, site);
	return target.href;
}

export const init: ServerInit = async () => {
	if (!VERCEL) {
		const { get_default_backend } = await import('#app/services.js');
		await get_default_backend();

		const { warn_about_shadowed_pages } = await import('#app/markdown/shadowed.js');
		await warn_about_shadowed_pages();

		const { warn_about_language_slug_collisions } = await import('#app/server_language_slugs.js');
		await warn_about_language_slug_collisions();
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	// Navigations only. The target counts as external, so the site's origin is
	// allowlisted — not `external: true`, which would permit redirecting anywhere.
	const canonical_origin = URL.parse(site.origin);
	if (canonical_origin && (event.request.method === 'GET' || event.request.method === 'HEAD')) {
		const canonical_url = get_canonical_redirect(event.url, canonical_origin, site);
		if (canonical_url) redirect(301, canonical_url, { external: [canonical_origin.origin] });
	}

	event.locals.user = null;
	event.locals.is_editor = false;
	if (!VERCEL) {
		const { sign_in_state } = await import('#app/server_auth.js');
		Object.assign(event.locals, await sign_in_state(event));
	}

	const language = request_language(event.url) || site.main_language;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', language)
	});
	// The OAuth consent page must not be embeddable, so a framed click cannot approve an app.
	if (normalize_href(event.url.pathname, site) === '/oauth/authorize')
		response.headers.set('X-Frame-Options', 'DENY');
	return response;
};
