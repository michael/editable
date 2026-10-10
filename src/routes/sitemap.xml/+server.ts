import { ORIGIN, VERCEL } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { render_sitemap } from '#lib/server/sitemap.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Static demo deployments have no database-backed page tree.
	if (VERCEL) error(404, 'Sitemap unavailable');

	const { get_sitemap_entries } = await import('#app/api.remote.js');
	const entries = await get_sitemap_entries();
	const body = new TextEncoder().encode(render_sitemap(entries, ORIGIN));
	// Crawlers get a complete, sized response they may cache briefly.
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Content-Length': String(body.byteLength),
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
