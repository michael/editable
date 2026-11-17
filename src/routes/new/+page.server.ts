import { error, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { site } from '#app/server_site.js';
import { resolve_href, resolve_hrefs } from '#app/document_links.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (VERCEL) {
		return {
			shared_documents: null,
			source_document: null
		};
	}

	if (!locals.is_editor) {
		redirect(303, resolve_href('/', site));
	}

	const { get_doc_from_db, get_shared_documents, resolve_page } =
		await import('#app/server_documents.js');
	const shared_documents = await get_shared_documents();

	// `?from=<slug>` starts the new page as a copy of an existing one: its own nodes only, since
	// the new page references the current shared documents instead of copying them.
	const from_slug = url.searchParams.get('from');
	const source = from_slug ? await resolve_page(from_slug) : null;
	if (from_slug && !source) error(404, `Page not found for slug: ${from_slug}`);
	const source_document = source
		? resolve_hrefs(await get_doc_from_db(source.document_id), site)
		: null;

	return {
		shared_documents,
		source_document
	};
};
