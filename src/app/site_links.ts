import { page } from '$app/state';
import { language_href } from './languages.js';

/**
 * Prefix a site-relative link such as /about with the path the site is
 * served under. Stored links never include it; other links pass through.
 */
export function with_site_base(href: string, base: string): string {
	if (!base || !href.startsWith('/') || href.startsWith('//')) return href;
	// The home page is the base itself, without a trailing slash.
	return base + (href === '/' || /^\/[?#]/.test(href) ? href.slice(1) : href);
}

/** The site-relative path of a pathname that may include the site base. */
export function without_site_base(pathname: string, base: string): string {
	if (!base || (pathname !== base && !pathname.startsWith(`${base}/`))) return pathname;
	return pathname.slice(base.length) || '/';
}

/** A site-relative link as the browser needs it, during rendering and navigation. */
export function site_href(href: string): string {
	return with_site_base(href, page.data.site_base ?? '');
}

/** The site-relative pathname of a URL the browser is at. */
export function site_pathname(url: Pick<URL, 'pathname'>): string {
	return without_site_base(url.pathname, page.data.site_base ?? '');
}

/** The current page in another language, keeping the site base. */
export function site_language_href(
	url: Pick<URL, 'pathname' | 'search' | 'hash'>,
	language: string,
	languages: string[]
): string {
	const path = `${site_pathname(url)}${url.search}${url.hash}`;
	return site_href(language_href(path, language, languages));
}
