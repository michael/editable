import { getRequestEvent } from '$app/server';
import { LANGUAGES, ORIGIN, VERCEL } from '$app/env/private';
import { language_path, parse_languages } from './languages.js';
import { without_site_base } from './site_links.js';
import type { SiteStorage } from './services.js';

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
	/** The site's database and asset files; the deployment's own in DATA_DIR when unset. */
	storage?: SiteStorage;
};

// No database dependencies: safe to import from static/no-backend routes.
export const default_site: Site = {
	origin: ORIGIN,
	base: '',
	languages: VERCEL ? [] : parse_languages(LANGUAGES)
};

/** The current request's site; outside a request, such as at startup, the deployment's own. */
export function get_site(): Site {
	try {
		return getRequestEvent().locals.site ?? default_site;
	} catch {
		return default_site;
	}
}

/** The language of a request URL, read after the site base. */
export function request_language(url: URL) {
	const { base, languages } = get_site();
	if (!languages.length) return '';
	return language_path(without_site_base(url.pathname, base), languages).language;
}
