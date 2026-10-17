import { redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { site } from '#app/server_site.js';
import { resolve_href } from '#app/document_links.js';
import type { PageServerLoad } from './$types';

// Deliberately no `await parent()` here — see routes/+page.server.ts.
export const load: PageServerLoad = async ({ locals, url }) => {
	if (VERCEL) {
		return {
			shared_documents: null,
			source_document: null
		};
	}

	if (!locals.user) {
		throw redirect(303, resolve_href('/', site));
	}

	const api_module = await import('#app/api.remote.js');
	const shared_documents = await api_module.get_shared_documents();

	// `?from=<slug>` starts the new page as a copy of an existing one.
	const from_slug = url.searchParams.get('from');
	const source_document = from_slug
		? (await api_module.get_page_document_for_duplicate(from_slug)).document
		: null;

	return {
		shared_documents,
		source_document
	};
};
