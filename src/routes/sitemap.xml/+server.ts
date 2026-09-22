import { ORIGIN, VERCEL } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { render_sitemap } from '#lib/server/sitemap.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Static demo deployments have no database-backed page tree.
	if (VERCEL) error(404, 'Sitemap unavailable');

	const { get_sitemap_paths } = await import('#app/api.remote.js');
	const paths = await get_sitemap_paths();
	return new Response(render_sitemap(paths, ORIGIN), {
		headers: { 'Content-Type': 'application/xml; charset=utf-8' }
	});
};
