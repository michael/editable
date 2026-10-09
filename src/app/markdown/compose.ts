// Compose a converted markdown page document with the site's shared banner, nav,
// and footer documents, then fill defaults and validate against the schema —
// mirroring what `get_combined_document` produces for database pages.

import { fill_document_defaults, validate_document } from 'svedit';
import { document_schema } from '#app/document_schema.js';
import type { Document } from 'svedit';

/**
 * Compose a converted markdown page document (without banner/nav/footer) with
 * the site's shared banner, nav, and footer documents.
 */
export function compose_markdown_document(
	page_doc: Document,
	shared_documents: {
		banner_document: Document;
		nav_document: Document;
		footer_document: Document;
	}
): Document {
	const banner_document = shared_documents?.banner_document;
	const nav_document = shared_documents?.nav_document;
	const footer_document = shared_documents?.footer_document;

	if (!banner_document?.document_id || !banner_document?.nodes) {
		throw new Error('Missing banner document for markdown page composition.');
	}
	if (!nav_document?.document_id || !nav_document?.nodes) {
		throw new Error('Missing nav document for markdown page composition.');
	}
	if (!footer_document?.document_id || !footer_document?.nodes) {
		throw new Error('Missing footer document for markdown page composition.');
	}

	const shared_nodes = {
		...structuredClone(banner_document.nodes),
		...structuredClone(nav_document.nodes),
		...structuredClone(footer_document.nodes)
	};

	for (const node_id of Object.keys(page_doc.nodes)) {
		if (node_id in shared_nodes) {
			throw new Error(
				`Markdown node id "${node_id}" collides with a shared banner/nav/footer node id.`
			);
		}
	}

	const nodes = { ...shared_nodes, ...page_doc.nodes };
	nodes[page_doc.document_id] = {
		...nodes[page_doc.document_id],
		banner: banner_document.document_id,
		nav: nav_document.document_id,
		footer: footer_document.document_id
	};

	const doc = fill_document_defaults({ document_id: page_doc.document_id, nodes }, document_schema);
	validate_document(doc, document_schema);
	return doc;
}
