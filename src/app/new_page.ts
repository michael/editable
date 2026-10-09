import nanoid from '#app/nanoid.js';
import { MEDIA_DEFAULTS, document_schema } from '#app/document_schema.js';
import { clone_subtree_with_new_ids } from '#lib/document_graph.js';
import type { Document } from 'svedit';

type SharedDocuments = {
	banner_document: Document;
	nav_document: Document;
	footer_document: Document;
};

function get_shared_roots(shared_documents: SharedDocuments) {
	const banner_document = shared_documents?.banner_document;
	const nav_document = shared_documents?.nav_document;
	const footer_document = shared_documents?.footer_document;

	if (!banner_document?.document_id || !banner_document?.nodes) {
		throw new Error('Missing banner document for new page creation');
	}

	if (!nav_document?.document_id || !nav_document?.nodes) {
		throw new Error('Missing nav document for new page creation');
	}

	if (!footer_document?.document_id || !footer_document?.nodes) {
		throw new Error('Missing footer document for new page creation');
	}

	return { banner_document, nav_document, footer_document };
}

/**
 * Create an unsaved copy of an existing page for `/new?from=<slug>`.
 *
 * Every node belonging to the source page gets a fresh id, so the copy shares no
 * ids with the original once saved. The shared banner, nav, and footer are
 * referenced, not copied — they belong to their own documents — and are
 * re-pointed at the current shared documents rather than whatever the source
 * happened to reference.
 */
export function create_duplicate_doc(
	source_document: Document,
	shared_documents: SharedDocuments
): Document {
	const { banner_document, nav_document, footer_document } = get_shared_roots(shared_documents);

	if (!source_document?.document_id || !source_document?.nodes) {
		throw new Error('Missing source document for page duplication');
	}

	const source_root = source_document.nodes[source_document.document_id];

	// The source page's own nodes are stored without the shared subtrees, so the
	// banner/nav/footer references would otherwise be collected and remapped to
	// ids that do not exist.
	const shared_roots = new Set<string>();
	if (typeof source_root?.banner === 'string') shared_roots.add(source_root.banner);
	if (typeof source_root?.nav === 'string') shared_roots.add(source_root.nav);
	if (typeof source_root?.footer === 'string') shared_roots.add(source_root.footer);

	const { root_id, nodes } = clone_subtree_with_new_ids(
		source_document.document_id,
		source_document.nodes,
		nanoid,
		document_schema,
		shared_roots
	);

	nodes[root_id].banner = banner_document.document_id;
	nodes[root_id].nav = nav_document.document_id;
	nodes[root_id].footer = footer_document.document_id;

	return {
		document_id: root_id,
		nodes: {
			...structuredClone(banner_document.nodes),
			...structuredClone(nav_document.nodes),
			...structuredClone(footer_document.nodes),
			...nodes
		}
	};
}

/**
 * Create a new unsaved page document for the `/new` route.
 *
 * The page id is generated on the client up front and used for both:
 * - the document's `document_id`
 * - the root page node's `id`
 *
 * The shared banner/nav/footer nodes are provided by the server so the new page is
 * composed from the current database-backed shared documents rather than the
 * default site data.
 */
export function create_empty_doc(shared_documents: SharedDocuments): Document {
	const page_id = nanoid();
	const page_image_id = nanoid();
	const prose_id = nanoid();
	const heading_id = nanoid();
	const paragraph_id = nanoid();

	const { banner_document, nav_document, footer_document } = get_shared_roots(shared_documents);

	return {
		document_id: page_id,
		nodes: {
			...structuredClone(banner_document.nodes),
			...structuredClone(nav_document.nodes),
			...structuredClone(footer_document.nodes),
			[page_id]: {
				id: page_id,
				type: 'page',
				title: {
					content: '',
					marks: [],
					annotations: []
				},
				description: {
					content: '',
					marks: [],
					annotations: []
				},
				image: page_image_id,
				banner: banner_document.document_id,
				nav: nav_document.document_id,
				footer: footer_document.document_id,
				body: { nodes: [prose_id], marks: [], annotations: [] }
			},
			[page_image_id]: {
				id: page_image_id,
				type: 'image',
				...MEDIA_DEFAULTS
			},
			[prose_id]: {
				id: prose_id,
				type: 'prose',
				layout: 'narrow-left',
				body: { nodes: [heading_id, paragraph_id], marks: [], annotations: [] }
			},
			[heading_id]: {
				id: heading_id,
				type: 'heading_1',
				content: {
					content: '',
					marks: [],
					annotations: []
				}
			},
			[paragraph_id]: {
				id: paragraph_id,
				type: 'paragraph',
				content: {
					content: '',
					marks: [],
					annotations: []
				}
			}
		}
	};
}
