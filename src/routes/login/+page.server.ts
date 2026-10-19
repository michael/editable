import { error, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { site } from '#app/server_site.js';
import { resolve_href } from '#app/document_links.js';
import type { PageServerLoad } from './$types';

/** Where to go after logging in: a path on this site, the home page otherwise. */
function redirect_target(url: URL) {
	const target = url.searchParams.get('redirect_to') ?? '/';
	// A path only, never another site: //example.com would leave it.
	return target.startsWith('/') && !target.startsWith('//') ? target : '/';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (VERCEL) error(404, 'Not found');
	const redirect_to = redirect_target(url);
	if (locals.user) redirect(303, resolve_href(redirect_to, site));
	return { redirect_to };
};
