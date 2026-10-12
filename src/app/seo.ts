import { language_href } from './languages.js';
import { with_site_base } from './site_links.js';

export type LanguageAlternate = { language: string; path: string };

/** Every language version lists the same alternatives, including itself. */
export function language_alternates(pathname: string, languages: string[]): LanguageAlternate[] {
	if (languages.length < 2) return [];
	return [
		...languages.map((language) => ({
			language,
			path: language_href(pathname, language, languages)
		})),
		{ language: 'x-default', path: language_href(pathname, languages[0], languages) }
	];
}

/**
 * Canonical URLs contain only the configured origin, the path the site is
 * served under, and the page pathname.
 */
export function absolute_page_url(pathname: string, origin: string, base = '') {
	const url = new URL(origin);
	url.pathname = with_site_base(pathname, base);
	url.search = '';
	url.hash = '';
	return url.href;
}
