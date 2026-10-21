import { error, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { site } from '#app/server_site.js';
import { resolve_href } from '#app/document_links.js';
import { redirect_target } from '#lib/server/auth.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (VERCEL) error(404, 'Not found');
	const redirect_to = redirect_target(url);
	if (locals.user) redirect(303, resolve_href(redirect_to, site));
	return { redirect_to };
};
