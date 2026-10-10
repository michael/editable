import type { DocumentNode } from 'svedit';
import { db } from './services.js';
import { extract_page_metadata } from './page_metadata.js';
import {
	type DocumentData,
	combine_page_document,
	get_active_slug_for_document_id,
	get_home_page_id_from_db,
	persist_combined_page,
	shared_document_types
} from './server_documents.js';

type VersionedDocument = DocumentData & { updated_at: string | null };

function get_versioned_document(document_id: string): VersionedDocument | null {
	const row = db
		.prepare('SELECT data, updated_at FROM documents WHERE document_id = ?')
		.get(document_id) as { data: string; updated_at: string | null } | undefined;
	if (!row) return null;
	return { ...(JSON.parse(row.data) as DocumentData), updated_at: row.updated_at ?? null };
}

/** Versions of the page and its shared documents, keyed by document id. */
function get_document_versions(page: VersionedDocument): Record<string, string | null> {
	const versions: Record<string, string | null> = { [page.document_id]: page.updated_at };
	for (const type of shared_document_types) {
		const shared_id = page.nodes[page.document_id]?.[type];
		if (typeof shared_id === 'string')
			versions[shared_id] = get_versioned_document(shared_id)?.updated_at ?? null;
	}
	return versions;
}

function page_for_href(page_href: string): { document_id: string; slug: string } | null {
	if (page_href === '/') {
		const home_page_id = get_home_page_id_from_db();
		return home_page_id ? { document_id: home_page_id, slug: '/' } : null;
	}
	const slug = page_href.replace(/^\/+/, '').replace(/\/+$/, '');
	const row = db
		.prepare('SELECT document_id FROM document_slugs WHERE slug = ? AND is_active = 1')
		.get(slug) as { document_id: string } | undefined;
	return row ? { document_id: row.document_id, slug: `/${slug}` } : null;
}

export function read_mcp_page(page_href: string) {
	const page = page_for_href(page_href);
	const page_doc = page && get_versioned_document(page.document_id);
	if (!page || !page_doc) throw new Error(`Page not found: ${page_href}`);
	return {
		document: combine_page_document(page_doc),
		page_href: page.slug,
		expected_updated_at: get_document_versions(page_doc)
	};
}

export async function save_mcp_page(input: {
	document_id: string;
	nodes: Record<string, unknown>;
	expected_updated_at: Record<string, string | null>;
}) {
	const current = get_versioned_document(input.document_id);
	if (current?.nodes[input.document_id]?.type !== 'page')
		throw new Error(`Existing page not found: ${input.document_id}`);
	for (const [document_id, updated_at] of Object.entries(get_document_versions(current))) {
		if (updated_at !== input.expected_updated_at[document_id])
			throw new Error(
				document_id === input.document_id
					? 'Page changed since it was read. Read it again before saving.'
					: `Shared document ${document_id} changed since it was read. Read the page again before saving.`
			);
	}

	// MCP writes are patches: overlay submitted node ids onto the latest full
	// document. Omitting a node leaves it untouched; unreachable nodes are
	// discarded when the page is split back into its documents.
	const nodes = {
		...combine_page_document(current).nodes,
		...(input.nodes as Record<string, DocumentNode>)
	};
	for (const type of shared_document_types) {
		if (nodes[input.document_id]?.[type] !== current.nodes[input.document_id][type])
			throw new Error(`The shared ${type} reference cannot be changed through save_page.`);
	}

	const { page_doc } = await persist_combined_page(input.document_id, nodes);
	const slug = get_active_slug_for_document_id(input.document_id);
	return {
		ok: true,
		document_id: input.document_id,
		page_href: slug ? `/${slug}` : '/',
		title: extract_page_metadata(page_doc).title
	};
}
