import { VERCEL } from '$app/env/private';
import { chrome_document } from '#app/chrome_document.js';
import type { PageServerLoad } from './$types';

export const prerender = !!VERCEL;

export const load: PageServerLoad = async () => {
	let shared_documents;
	if (VERCEL) {
		const { default_banner_document, default_nav_document, default_footer_document } =
			await import('#app/default_site.js');
		shared_documents = {
			banner_document: default_banner_document,
			nav_document: default_nav_document,
			footer_document: default_footer_document
		};
	} else {
		const { get_shared_documents } = await import('#app/api.remote.js');
		shared_documents = await get_shared_documents();
	}

	const document = chrome_document(
		'design-system-page',
		{
			title: 'The Editable Design System',
			description: "Editable's visual reference, in plain HTML and Tailwind."
		},
		shared_documents
	);

	return { document, slug: 'design-system', can_edit: false };
};
