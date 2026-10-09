import { VERCEL } from '$app/env/private';
import { fill_document_defaults, validate_document } from 'svedit';
import { document_schema, MEDIA_DEFAULTS } from '#app/document_schema.js';
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

	const { banner_document, nav_document, footer_document } = shared_documents;
	const document_id = 'design-system-page';
	const image_id = 'design-system-page-image';
	// The route supplies the body as a snippet; the document supplies metadata and shared chrome.
	const document = fill_document_defaults(
		{
			document_id,
			nodes: {
				...structuredClone(banner_document.nodes),
				...structuredClone(nav_document.nodes),
				...structuredClone(footer_document.nodes),
				[image_id]: { id: image_id, type: 'image', ...MEDIA_DEFAULTS },
				[document_id]: {
					id: document_id,
					type: 'page',
					image: image_id,
					title: { content: 'The Editable Design System', marks: [], annotations: [] },
					description: {
						content: "Editable's visual reference, in plain HTML and Tailwind.",
						marks: [],
						annotations: []
					},
					banner: banner_document.document_id,
					nav: nav_document.document_id,
					footer: footer_document.document_id
				}
			}
		},
		document_schema
	);
	validate_document(document, document_schema);

	return { document, slug: 'design-system', can_edit: false };
};
