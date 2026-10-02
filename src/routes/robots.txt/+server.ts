import { ORIGIN, VERCEL } from '$app/env/private';
import { absolute_page_url } from '#app/seo.js';
import type { RequestHandler } from './$types';

export const prerender = !!VERCEL;

export const GET: RequestHandler = () => {
	const sitemap =
		!VERCEL && ORIGIN ? `Sitemap: ${absolute_page_url('/sitemap.xml', ORIGIN)}\n` : '';
	return new Response(`User-agent: *\nDisallow:\n${sitemap}`, {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' }
	});
};
