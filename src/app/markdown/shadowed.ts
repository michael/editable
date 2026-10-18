// Detection of database pages whose slug is occupied by a markdown page.
//
// Kept out of registry.js so that module stays database-free — the markdown
// route imports it at module load, including in static/Vercel mode.

import { backend } from '#app/services.js';
import { is_reserved_markdown_slug } from './registry.js';

export type ShadowedPage = {
	slug: string;
	document_id: string;
};

/** Pages that exist in the database but whose URL a markdown page serves. */
export async function find_shadowed_pages(): Promise<ShadowedPage[]> {
	const pages = new Set((await backend.list_documents('page')).map((record) => record.document_id));
	const rows = (await backend.list_slugs())
		.filter((record) => record.is_active && pages.has(record.document_id))
		.map(({ slug, document_id }) => ({ slug, document_id }));

	return rows.filter((row) => is_reserved_markdown_slug(row.slug));
}

/** Log a startup warning for each shadowed page. */
export async function warn_about_shadowed_pages() {
	for (const page of await find_shadowed_pages()) {
		console.warn(
			`Page "/${page.slug}" (${page.document_id}) is shadowed by a markdown page and is ` +
				`unreachable. Change its Page URL, or remove the /${page.slug} entry from MARKDOWN_SOURCES.`
		);
	}
}
