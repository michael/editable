import { language_href } from './languages.js';
import { resolve_href, type SiteLinks } from './document_links.js';

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
 * Canonical URLs contain only the site's origin, the path it is served
 * under, and the page pathname, which names its language itself.
 */
export function absolute_page_url(
	pathname: string,
	{ origin, base }: Pick<SiteLinks, 'origin' | 'base'>
) {
	const url = new URL(origin);
	url.pathname = resolve_href(pathname, { origin, base, languages: [] });
	url.search = '';
	url.hash = '';
	return url.href;
}
