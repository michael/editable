import { site } from '#app/server_site.js';
import { render_sitemap } from '#lib/server/sitemap.js';
import { get_sitemap_entries } from '#app/page_browser_data.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const entries = await get_sitemap_entries();
	const body = new TextEncoder().encode(render_sitemap(entries, site));
	// Crawlers get a complete, sized response they may cache briefly.
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Content-Length': String(body.byteLength),
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
