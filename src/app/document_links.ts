import { language_path } from './languages.js';
import type { Document } from 'svedit';

/**
 * Links are stored site-relative and language-free: /about. Served, they
 * carry the path the site is served under and the reader's language:
 * /alice/de/about. resolve_href and normalize_href convert one link each
 * way. Every root-relative link gets the base, so asset URLs and Editable's
 * own routes resolve too; only page links get a language, and a link that
 * names a language keeps it. The language is '' for the main language.
 */
export type SiteLinks = { origin: string; base: string; languages: string[] };

/** Top-level paths served by Editable's own routes; never page slugs. */
export const RESERVED_ROUTE_SLUGS = new Set([
	'api',
	'assets',
	'design-system',
	'mcp',
	'new',
	'oauth'
]);

/** A link to this site, root-relative or absolute on its origin, split for rebuilding. */
function own_link(href: string, origin: string): { url: URL; prefix: string } | null {
	if (!href || href.startsWith('#')) return null;
	const site_origin = origin || 'http://editable.local';
	const url = URL.parse(href, site_origin);
	if (
		!url ||
		url.origin !== new URL(site_origin).origin ||
		!['http:', 'https:'].includes(url.protocol)
	)
		return null;
	const prefix = href.startsWith('//') ? `//${url.host}` : /^https?:/i.test(href) ? url.origin : '';
	return { url, prefix };
}

const rebuild = ({ url, prefix }: { url: URL; prefix: string }, pathname: string) =>
	`${prefix}${pathname}${url.search}${url.hash}`;

function strip_base(pathname: string, base: string) {
	if (!base || (pathname !== base && !pathname.startsWith(`${base}/`))) return pathname;
	return pathname.slice(base.length) || '/';
}

// The home page is the base itself, without a trailing slash.
const add_base = (pathname: string, base: string) =>
	base ? base + (pathname === '/' ? '' : pathname) : pathname;

const is_page = (pathname: string) =>
	pathname === '/' || (/^\/[^/.]+$/.test(pathname) && !RESERVED_ROUTE_SLUGS.has(pathname.slice(1)));

/** A stored link as the browser needs it for this site and language. */
export function resolve_href(href: string, site: SiteLinks, language: string): string {
	const link = own_link(href, site.origin);
	if (!link) return href;
	const path = strip_base(link.url.pathname, site.base);
	const page = language_path(path, site.languages).pathname;
	const explicit = page !== path;
	const localized =
		language && !explicit && is_page(page) ? `/${language}${page === '/' ? '' : page}` : path;
	const resolved = add_base(localized, site.base);
	return resolved === link.url.pathname ? href : rebuild(link, resolved);
}

/** A served link in its stored form: without the base, and without the given language. */
export function normalize_href(href: string, site: SiteLinks, language: string): string {
	const link = own_link(href, site.origin);
	if (!link) return href;
	const path = strip_base(link.url.pathname, site.base);
	const resolved = language_path(path, site.languages);
	const normalized =
		resolved.language === language && resolved.pathname !== path ? resolved.pathname : path;
	return normalized === link.url.pathname ? href : rebuild(link, normalized);
}

/** resolve_href on every link of a document, on a copy. */
export function resolve_hrefs(source: Document, site: SiteLinks, language: string): Document {
	if (!language && !site.base) return source;
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href === 'string') node.href = resolve_href(node.href, site, language);
	}
	return document;
}

/**
 * normalize_href on every link of a document, on a copy. A link that still
 * resolves to what was stored before stays exactly as it was stored, so a
 * link naming a language keeps naming it.
 */
export function normalize_hrefs(
	source: Document,
	baseline: Document,
	site: SiteLinks,
	language: string
): Document {
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href !== 'string') continue;
		const original_href = baseline.nodes[node.id]?.href;
		node.href =
			typeof original_href === 'string' && node.href === resolve_href(original_href, site, language)
				? original_href
				: normalize_href(node.href, site, language);
	}
	return document;
}

const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:', 'sms:']);

/** Links may be relative or use a protocol that cannot run code, so stored content cannot script the site. */
export function is_safe_href(href: string): boolean {
	const url = URL.parse(href.trim(), 'http://editable.local');
	return !!url && SAFE_HREF_PROTOCOLS.has(url.protocol);
}

/** Throw if any node links with an unsafe protocol such as javascript: or data:. */
export function assert_safe_hrefs(nodes: Document['nodes']) {
	const unsafe = Object.values(nodes)
		.filter((node) => typeof node.href === 'string' && !is_safe_href(node.href))
		.map((node) => node.id);
	if (unsafe.length)
		throw new Error(
			`Links must be relative or use http, https, mailto, tel, or sms. Unsafe href on: ${unsafe.join(', ')}.`
		);
}

/** Identify stored internal page links without losing their language, query, or fragment. */
export function parse_internal_page_href(href: unknown, languages: string[]) {
	if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
	const pathname = href.split(/[?#]/, 1)[0];
	const resolved = language_path(pathname, languages);
	const segments = resolved.pathname.split('/').filter(Boolean);
	if (segments.length !== 1) return null;
	return {
		slug: segments[0],
		prefix: resolved.pathname !== pathname ? `/${resolved.language}` : '',
		suffix: href.slice(pathname.length)
	};
}
