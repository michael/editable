import { site } from '#app/server_site.js';
import { absolute_page_url } from '#app/seo.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const sitemap = site.origin ? `Sitemap: ${absolute_page_url('/sitemap.xml', site)}\n` : '';
	return new Response(`User-agent: *\nDisallow:\n${sitemap}`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
