import type { Document } from 'svedit';

function internal_page_url(href: string, origin: string): URL | null {
	if (!href || href.startsWith('#')) return null;
	try {
		const base = origin || 'http://editable.local';
		const url = new URL(href, base);
		if (url.origin !== new URL(base).origin || !['http:', 'https:'].includes(url.protocol))
			return null;
		if (
			url.pathname !== '/' &&
			(!/^\/[^/.]+$/.test(url.pathname) || ['/new', '/design-system'].includes(url.pathname))
		)
			return null;
		return url;
	} catch {
		return null;
	}
}

/** Preserve the stored spelling, query parameters, and fragment when adding language. */
export function translated_href(href: string, language: string, origin: string): string {
	const url = internal_page_url(href, origin);
	if (!language || !url || url.searchParams.has('lang')) return href;
	const hash_index = href.indexOf('#');
	const base = hash_index < 0 ? href : href.slice(0, hash_index);
	const hash = hash_index < 0 ? '' : href.slice(hash_index);
	return `${base}${base.includes('?') ? '&' : '?'}lang=${encodeURIComponent(language)}${hash}`;
}

export function translate_document_links(
	source: Document,
	language: string,
	origin: string
): Document {
	if (!language) return source;
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href === 'string') node.href = translated_href(node.href, language, origin);
	}
	return document;
}

/** Navigation parameters are a projection, not a change to stored content. */
export function restore_document_links(
	source: Document,
	baseline: Document,
	language: string,
	origin: string
): Document {
	const document = structuredClone(source);
	for (const node of Object.values(document.nodes)) {
		if (typeof node.href !== 'string') continue;
		const original_href = baseline.nodes[node.id]?.href;
		if (
			typeof original_href === 'string' &&
			node.href === translated_href(original_href, language, origin)
		) {
			node.href = original_href;
			continue;
		}
		const url = internal_page_url(node.href, origin);
		if (!url || url.searchParams.get('lang') !== language) continue;
		// Also normalize a newly created/edited link, without re-encoding unrelated parameters.
		const hash_index = node.href.indexOf('#');
		const base = hash_index < 0 ? node.href : node.href.slice(0, hash_index);
		const hash = hash_index < 0 ? '' : node.href.slice(hash_index);
		const query_index = base.indexOf('?');
		const query = base
			.slice(query_index + 1)
			.split('&')
			.filter((part) => new URLSearchParams(part).get('lang') !== language)
			.join('&');
		node.href = `${base.slice(0, query_index)}${query ? `?${query}` : ''}${hash}`;
	}
	return document;
}
