import { getRequestEvent } from '$app/server';
import { building } from '$app/env';
import { LANGUAGES, ORIGIN, VERCEL } from '$app/env/private';
import { language_path, main_language, parse_languages } from './languages.js';
import { normalize_href } from './document_links.js';
import type { Backend } from '#lib/server/backend.js';
import type { Auth } from './server_auth.js';

/**
 * The site a request belongs to. A deployment serves one site, configured by
 * its environment. A host serving several sites from one process sets
 * event.locals.site in its own handle hook, before Editable's runs.
 */
export type Site = {
	/** Public origin, such as https://example.com. */
	origin: string;
	/** Path the site is served under, such as /alice, or '' at the root. */
	base: string;
	/** Enabled languages, the main language first; empty for a single-language site. */
	languages: string[];
	/** The language the site is written in, such as 'de', which its pages declare. */
	main_language: string;
	/** Where the site's records and asset files go, migrated; the deployment's own when unset. */
	backend?: Backend;
	/** Who may edit the site and how they sign in; the admin password when unset. */
	auth?: Auth;
};

// No database dependencies: safe to import from static/no-backend routes.
export const default_site: Site = {
	origin: ORIGIN,
	base: '',
	languages: VERCEL ? [] : parse_languages(LANGUAGES),
	// Static builds have no backend and need no LANGUAGES. Builds run without the
	// environment, like env.ts, and render nothing with a backend, so they skip it too.
	main_language: VERCEL || building ? 'en' : main_language(LANGUAGES)
};

/** The current request's site; outside a request, such as at startup, the deployment's own. */
function current_site(): Site {
	try {
		return getRequestEvent().locals.site ?? default_site;
	} catch {
		return default_site;
	}
}

/** The site of the request being handled, read on every access. */
export const site: Site = {
	get origin() {
		return current_site().origin;
	},
	get base() {
		return current_site().base;
	},
	get languages() {
		return current_site().languages;
	},
	get main_language() {
		return current_site().main_language;
	},
	get backend() {
		return current_site().backend;
	},
	get auth() {
		return current_site().auth;
	}
};

/** The language of a request URL, read after the site base. */
export function request_language(url: URL) {
	if (!site.languages.length) return '';
	return language_path(normalize_href(url.pathname, site), site.languages).language;
}
