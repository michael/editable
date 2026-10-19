import { fill_document_defaults, validate_document, type Document } from 'svedit';
import { document_schema, MEDIA_DEFAULTS } from './document_schema.js';

/** The site's shared banner, nav, and footer documents. */
export type SharedDocuments = {
	banner_document: Document;
	nav_document: Document;
	footer_document: Document;
};

/**
 * A page document for a route of its own, such as the design system or an
 * app's page: the site's banner, nav, and footer around the content the route
 * renders as App's children, with a title and description for its metadata.
 */
export function chrome_document(
	document_id: string,
	{ title, description = '' }: { title: string; description?: string },
	{ banner_document, nav_document, footer_document }: SharedDocuments
): Document {
	const image_id = `${document_id}-image`;
	const text = (content: string) => ({ content, marks: [], annotations: [] });
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
					title: text(title),
					description: text(description),
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
