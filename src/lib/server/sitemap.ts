export type SitemapEntry = {
	path: string;
	lastmod: string | null;
};

/** Render canonical absolute URLs with XML escaping. */
export function render_sitemap(entries: SitemapEntry[], origin: string): string {
	const unique_entries = new Map(entries.map((entry) => [entry.path, entry]));
	const urls = [...unique_entries.values()].map(({ path, lastmod }) => {
		const url = new URL(origin);
		url.pathname = path;
		url.search = '';
		url.hash = '';
		const location = url.href.replace(/[<>&"']/g, (character) => {
			return {
				'<': '&lt;',
				'>': '&gt;',
				'&': '&amp;',
				'"': '&quot;',
				"'": '&apos;'
			}[character]!;
		});
		const modified_at = lastmod ? new Date(lastmod) : null;
		const lastmod_xml =
			modified_at && !Number.isNaN(modified_at.getTime())
				? `<lastmod>${modified_at.toISOString()}</lastmod>`
				: '';
		return `\t<url><loc>${location}</loc>${lastmod_xml}</url>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
