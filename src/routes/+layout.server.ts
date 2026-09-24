import { parse_languages, select_language } from '#app/languages.js';
import { LANG, ORIGIN, VERCEL } from '$app/env/private';
import {
	default_footer_document,
	default_nav_document,
	default_site_document
} from '#app/default_site.js';
import { extract_site_metadata } from '#app/page_metadata.js';
import { document_schema } from '#app/document_schema.js';
import { fill_document_defaults, validate_document } from 'svedit';
import type { Document } from 'svedit';
import type { LayoutServerLoad } from './$types';

// Static hosts resolve directory indexes reliably, while Node deployments keep
// the existing no-trailing-slash URLs for database-backed routes.
export const trailingSlash = VERCEL ? 'always' : 'never';

function create_not_found_document(shared_documents): Document {
	const document_id = 'notfoundpage000000000';
	const image_id = 'notfoundimage00000000';
	const nodes = {
		...structuredClone(shared_documents.nav_document.nodes),
		...structuredClone(shared_documents.footer_document.nodes),
		[image_id]: { id: image_id, type: 'image' },
		[document_id]: {
			id: document_id,
			type: 'page',
			title: { content: 'Page not found', marks: [], annotations: [] },
			image: image_id,
			nav: shared_documents.nav_document.document_id,
			footer: shared_documents.footer_document.document_id
		}
	};
	const doc = fill_document_defaults({ document_id, nodes }, document_schema);
	validate_document(doc, document_schema);
	return doc;
}

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const has_backend = !VERCEL;
	const languages = has_backend ? parse_languages(LANG) : [];
	const language = languages.length ? select_language(languages, url.searchParams.get('lang')) : '';

	let site_metadata;
	let not_found_document: Document = create_not_found_document({
		nav_document: default_nav_document,
		footer_document: default_footer_document
	});
	if (has_backend) {
		const { get_shared_documents, get_site_metadata } = await import('#app/api.remote.js');
		const [shared_documents, next_site_metadata] = await Promise.all([
			get_shared_documents(),
			get_site_metadata()
		]);
		if (language) {
			const { translate_shared_document } = await import('#app/server_translations.js');
			shared_documents.nav_document = translate_shared_document(
				shared_documents.nav_document,
				language
			);
			shared_documents.footer_document = translate_shared_document(
				shared_documents.footer_document,
				language
			);
		}
		not_found_document = create_not_found_document(shared_documents);
		site_metadata = next_site_metadata;
	} else {
		site_metadata = extract_site_metadata(default_site_document);
	}

	return {
		languages,
		language,
		has_backend,
		is_admin: !!locals.is_admin,
		origin: ORIGIN,
		favicon: site_metadata.favicon,
		not_found_document
	};
};
