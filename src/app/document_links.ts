import { RESERVED_ROUTE_SLUGS } from './config.js';
import { language_path } from './languages.js';
import type { Document } from 'svedit';

/**
 * Links are stored site-relative and language-free: /about. Served, they
 * carry the path the site is served under and the reader's language:
 * /alice/de/about. resolve_href and normalize_href convert one link each
 * way. Every root-relative link gets the base, so asset URLs and Editable's
 * own routes resolve too; only page links get a language, and a link that
 * names a language keeps it. The main language is '' or its own code.
 *
 * Both sides pass their `site`: the server's names the request's site and the
 * language to serve; the browser's carries the page's language too, so links it
 * hands over are taken out of that language first and it is the default to serve.
 */
export type SiteLinks = { origin: string; base: string; languages: string[]; language?: string };

type Href = string | Pick<URL, 'pathname' | 'search' | 'hash'>;

const href_of = (href: Href) =>
	typeof href === 'string' ? href : `${href.pathname}${href.search}${href.hash}`;

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

/** A link as the browser needs it for this site and language. */
export function resolve_href(
	href: Href,
	site: SiteLinks,
	language: string = site.language ?? ''
): string {
	if (site.language) href = normalize_href(href, site, site.language);
	const link = own_link(href_of(href), site.origin);
	if (!link) return href_of(href);
	const path = strip_base(link.url.pathname, site.base);
	const page = language_path(path, site.languages).pathname;
	const explicit = page !== path;
	const translation = language !== site.languages[0] ? language : '';
	const localized =
		translation && !explicit && is_page(page) ? `/${translation}${page === '/' ? '' : page}` : path;
	const resolved = add_base(localized, site.base);
	return resolved === link.url.pathname ? href_of(href) : rebuild(link, resolved);
}

/** A served link in its stored form: without the base, and without the given language. */
export function normalize_href(
	href: Href,
	site: SiteLinks,
	language: string = site.language ?? ''
): string {
	const link = own_link(href_of(href), site.origin);
	if (!link) return href_of(href);
	const path = strip_base(link.url.pathname, site.base);
	const resolved = language_path(path, site.languages);
	const normalized =
		resolved.language === language && resolved.pathname !== path ? resolved.pathname : path;
	return normalized === link.url.pathname ? href_of(href) : rebuild(link, normalized);
}

/** The document with the links a function changes replaced, copying only what changes. */
function map_hrefs(source: Document, map: (href: string, id: string) => string): Document {
	let document = source;
	for (const [id, node] of Object.entries(source.nodes)) {
		if (typeof node.href !== 'string') continue;
		const href = map(node.href, id);
		if (href === node.href) continue;
		if (document === source) document = { ...source, nodes: { ...source.nodes } };
		document.nodes[id] = { ...node, href };
	}
	return document;
}

/** resolve_href on every link of a document. */
export function resolve_hrefs(
	source: Document,
	site: SiteLinks,
	language: string = site.language ?? ''
): Document {
	return map_hrefs(source, (href) => resolve_href(href, site, language));
}

/**
 * normalize_href on every link of a document. A link that still resolves to
 * what was stored before stays exactly as it was stored, so a link naming a
 * language keeps naming it.
 */
export function normalize_hrefs(
	source: Document,
	baseline: Document,
	site: SiteLinks,
	language: string = site.language ?? ''
): Document {
	return map_hrefs(source, (href, id) => {
		const original_href = baseline.nodes[id]?.href;
		return typeof original_href === 'string' && href === resolve_href(original_href, site, language)
			? original_href
			: normalize_href(href, site, language);
	});
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
