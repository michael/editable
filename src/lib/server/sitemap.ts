/** Render canonical absolute URLs with XML escaping. */
export function render_sitemap(paths: string[], origin: string): string {
	const urls = [...new Set(paths)].map((path) => {
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
		return `\t<url><loc>${location}</loc></url>`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
