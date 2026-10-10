import { language_path } from './languages.js';
import type { Document } from 'svedit';

function internal_page_url(href: string, origin: string, languages: string[]): URL | null {
	if (!href || href.startsWith('#')) return null;
	try {
		const base = origin || 'http://editable.local';
		const url = new URL(href, base);
		if (url.origin !== new URL(base).origin || !['http:', 'https:'].includes(url.protocol))
			return null;
		const { pathname } = language_path(url.pathname, languages);
		if (
			pathname !== '/' &&
			(!/^\/[^/.]+$/.test(pathname) || ['/new', '/design-system'].includes(pathname))
		)
			return null;
		return url;
	} catch {
		return null;
	}
}

function page_href(href: string, url: URL, pathname: string) {
	const origin = href.startsWith('//') ? `//${url.host}` : /^https?:/.test(href) ? url.origin : '';
	return `${origin}${pathname}${url.search}${url.hash}`;
}

/** Project unprefixed internal links; explicit language links keep their destination. */
export function translated_href(
	href: string,
	language: string,
	origin: string,
	languages: string[]
): string {
	const url = internal_page_url(href, origin, languages);
	if (!language || !url || language_path(url.pathname, languages).pathname !== url.pathname)
		return href;
	return page_href(href, url, `/${language}${url.pathname === '/' ? '' : url.pathname}`);
}

export function translate_document_links(
	source: Document,
	language: string,
	origin: string,
	languages: string[]
): Document {
	if (!language) return source;
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href === 'string')
			node.href = translated_href(node.href, language, origin, languages);
	}
	return document;
}

/** Language prefixes are a projection, not a change to stored content. */
export function restore_document_links(
	source: Document,
	baseline: Document,
	language: string,
	origin: string,
	languages: string[]
): Document {
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href !== 'string') continue;
		const original_href = baseline.nodes[node.id]?.href;
		if (
			typeof original_href === 'string' &&
			node.href === translated_href(original_href, language, origin, languages)
		) {
			node.href = original_href;
			continue;
		}
		const url = internal_page_url(node.href, origin, languages);
		if (!url) continue;
		const resolved = language_path(url.pathname, languages);
		if (resolved.language === language && resolved.pathname !== url.pathname)
			node.href = page_href(node.href, url, resolved.pathname);
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
