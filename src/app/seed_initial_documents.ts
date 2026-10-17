import {
	default_banner_document,
	default_nav_document,
	default_footer_document,
	default_page_document
} from '#app/default_site.js';
import { MEDIA_DEFAULTS } from '#app/document_schema.js';
import type { Backend } from '#lib/server/backend.js';
import type { Document } from 'svedit';

/**
 * Deep clone a document and reset all image/video nodes, since a fresh
 * site has no uploaded assets yet.
 */
function reset_media_nodes(doc: Document): Document {
	const cloned = structuredClone(doc);
	for (const node of Object.values(cloned.nodes)) {
		if ('src' in node) Object.assign(node, MEDIA_DEFAULTS);
	}
	return cloned;
}

/** Seed the default site content into an empty backend. */
export default async function seed_initial_documents(backend: Backend) {
	const now = new Date().toISOString();
	const documents = [
		['banner', default_banner_document],
		['nav', default_nav_document],
		['footer', default_footer_document],
		['page', default_page_document]
	] as const;
	for (const [type, document] of documents) {
		await backend.documents.put({
			document_id: document.document_id,
			type,
			data: reset_media_nodes(document),
			created_at: now,
			updated_at: now
		});
	}
	await backend.settings.put({
		key: 'home_page_id',
		value: default_page_document.document_id
	});
}
