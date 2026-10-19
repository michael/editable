import { fill_document_defaults, validate_document, type Document } from 'svedit';
import { document_schema, MEDIA_DEFAULTS } from './document_schema.js';

/** The site's shared banner, nav, and footer documents. */
export type SharedDocuments = {
	banner_document: Document;
	nav_document: Document;
	footer_document: Document;
};

/**
 * The shell of a page: the site's banner, nav, and footer around an empty
 * body. The layout builds it for every request, in the request's language,
 * and PageShell puts a route's own content and title into it.
 */
export function page_shell({
	banner_document,
	nav_document,
	footer_document
}: SharedDocuments): Document {
	const document_id = 'page-shell';
	const image_id = 'page-shell-image';
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
					banner: banner_document.document_id,
					nav: nav_document.document_id,
					footer: footer_document.document_id
				}
			}
		},
		document_schema
	);
	validate_document(document, document_schema);
	return document;
}
