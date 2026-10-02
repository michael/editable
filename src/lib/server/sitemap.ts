import { absolute_page_url, type LanguageAlternate } from '#app/seo.js';

export type SitemapEntry = {
	path: string;
	lastmod: string | null;
	alternates?: LanguageAlternate[];
};

function escape_xml(value: string) {
	return value.replace(/[<>&"']/g, (character) => {
		return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]!;
	});
}

/** Ignore invalid timestamps rather than advertising an invented modification date. */
export function latest_modified(values: (string | null | undefined)[]): string | null {
	const timestamps = values
		.map((value) => (value ? Date.parse(value) : NaN))
		.filter(Number.isFinite);
	return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

/** Render canonical absolute URLs with XML escaping. */
export function render_sitemap(entries: SitemapEntry[], origin: string): string {
	const unique_entries = new Map(entries.map((entry) => [entry.path, entry]));
	const has_alternates = entries.some((entry) => entry.alternates?.length);
	const urls = [...unique_entries.values()].map(({ path, lastmod, alternates = [] }) => {
		const location = escape_xml(absolute_page_url(path, origin));
		const alternate_xml = alternates
			.map(
				({ language, path }) =>
					`<xhtml:link rel="alternate" hreflang="${escape_xml(language)}" href="${escape_xml(absolute_page_url(path, origin))}" />`
			)
			.join('');
		const modified_at = lastmod ? new Date(lastmod) : null;
		const lastmod_xml =
			modified_at && !Number.isNaN(modified_at.getTime())
				? `<lastmod>${modified_at.toISOString()}</lastmod>`
				: '';
		return `\t<url><loc>${location}</loc>${alternate_xml}${lastmod_xml}</url>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${has_alternates ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ''}>\n${urls.join('\n')}\n</urlset>\n`;
}
