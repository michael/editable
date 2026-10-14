import { page } from '$app/state';
import { normalize_href, resolve_href } from './document_links.js';

/** The site of the page being shown, as the browser knows it from the layout data. */
const site = () => ({
	origin: page.data.origin ?? '',
	base: page.data.site_base ?? '',
	languages: page.data.languages ?? []
});

/** resolve_href for the page's site: asset URLs, navigation targets, and links in another language. */
export function site_href(href: string, language: string = page.data.language ?? ''): string {
	return resolve_href(href, site(), language);
}

/** normalize_href for the page's site: the stored form of a link, or of the page's own path. */
export function site_relative_href(
	href: string,
	language: string = page.data.language ?? ''
): string {
	return normalize_href(href, site(), language);
}
