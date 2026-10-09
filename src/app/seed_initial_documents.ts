import {
	default_banner_document,
	default_nav_document,
	default_footer_document,
	default_page_document
} from '#app/default_site.js';
import { MEDIA_DEFAULTS } from '#app/document_schema.js';
import type { DatabaseSync } from 'node:sqlite';
import type { Document } from 'svedit';

/**
 * Deep clone a document and reset all image/video nodes, since a fresh
 * database has no uploaded assets yet.
 */
function reset_media_nodes(doc: Document): Document {
	const cloned = structuredClone(doc);
	for (const node of Object.values(cloned.nodes)) {
		if ('src' in node) Object.assign(node, MEDIA_DEFAULTS);
	}
	return cloned;
}

/** Seed the default site content after a fresh database reaches the current schema. */
export default function seed_initial_documents({ db }: { db: DatabaseSync }) {
	const now = new Date().toISOString();
	const insert_doc = db.prepare(
		'INSERT INTO documents (document_id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
	);
	insert_doc.run(
		'banner_1',
		'banner',
		JSON.stringify(reset_media_nodes(default_banner_document)),
		now,
		now
	);
	insert_doc.run('nav_1', 'nav', JSON.stringify(reset_media_nodes(default_nav_document)), now, now);
	insert_doc.run(
		'footer_1',
		'footer',
		JSON.stringify(reset_media_nodes(default_footer_document)),
		now,
		now
	);
	insert_doc.run(
		default_page_document.document_id,
		'page',
		JSON.stringify(reset_media_nodes(default_page_document)),
		now,
		now
	);

	db.prepare('INSERT INTO site_settings (key, value) VALUES (?, ?)').run(
			'home_page_id',
			default_page_document.document_id
		);
}
