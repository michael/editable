import { VERCEL } from '$app/env/private';
import { get_site } from '#app/server_site.js';
import { absolute_page_url } from '#app/seo.js';
import type { RequestHandler } from './$types';

export const prerender = !!VERCEL;

export const GET: RequestHandler = () => {
	const { origin, base } = get_site();
	const sitemap =
		!VERCEL && origin ? `Sitemap: ${absolute_page_url('/sitemap.xml', origin, base)}\n` : '';
	return new Response(`User-agent: *\nDisallow:\n${sitemap}`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
