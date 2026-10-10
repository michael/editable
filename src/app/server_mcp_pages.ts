import { fill_node_defaults, type DocumentNode, type PropertyDefinition } from 'svedit';
import { db } from './services.js';
import { document_schema } from './document_schema.js';
import { extract_page_metadata } from './page_metadata.js';
import {
	collect_node_ids,
	combine_page_document,
	get_active_slug_for_document_id,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	get_page_version,
	persist_combined_page,
	shared_document_types
} from './server_documents.js';

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

/** Fill omitted properties, and omitted marks/annotations of text and node_array values. */
function fill_defaults(node: DocumentNode): DocumentNode {
	const filled = fill_node_defaults(node, document_schema);
	const properties = document_schema[filled.type]?.properties ?? {};
	for (const [name, definition] of Object.entries<PropertyDefinition>(properties)) {
		const value = filled[name];
		if ((definition.type === 'text' || definition.type === 'node_array') && value) {
			filled[name] = { ...value, marks: value.marks ?? [], annotations: value.annotations ?? [] };
		}
	}
	return filled;
}

export function read_mcp_page(page_href: string) {
	const page = page_for_href(page_href);
	const page_doc = page && get_optional_doc_from_db(page.document_id);
	if (!page || !page_doc) throw new Error(`Page not found: ${page_href}`);
	return {
		document: combine_page_document(page_doc),
		page_href: page.slug,
		version: get_page_version(page.document_id)
	};
}

export async function save_mcp_page(input: {
	document_id: string;
	nodes: Record<string, unknown>;
	expected_version: string;
}) {
	const current = get_optional_doc_from_db(input.document_id);
	if (current?.nodes[input.document_id]?.type !== 'page')
		throw new Error(`Existing page not found: ${input.document_id}`);
	// Check up front so a stale patch is not reported as unlinked or invalid.
	if (get_page_version(input.document_id) !== input.expected_version)
		throw new Error('Page changed since it was read. Read it again before saving.');

	// MCP writes are patches: overlay submitted node ids onto the latest full
	// document. Omitting a node leaves it untouched; unreachable stored nodes
	// are discarded when the page is split back into its documents. Omitted
	// properties of submitted nodes fall back to their schema defaults.
	const submitted_nodes = Object.fromEntries(
		Object.entries(input.nodes as Record<string, DocumentNode>).map(([id, node]) => [
			id,
			fill_defaults(node)
		])
	);
	const stored_nodes = combine_page_document(current).nodes;
	const nodes = { ...stored_nodes, ...submitted_nodes };
	for (const type of shared_document_types) {
		if (nodes[input.document_id]?.[type] !== current.nodes[input.document_id][type])
			throw new Error(`The shared ${type} reference cannot be changed through save_page.`);
	}

	// New or changed nodes that end up unreachable were almost certainly meant
	// to be linked; unchanged ones are deletions from a resent document.
	const reachable_ids = collect_node_ids(input.document_id, nodes);
	const unlinked_ids = Object.keys(submitted_nodes).filter(
		(id) =>
			!reachable_ids.has(id) &&
			JSON.stringify(submitted_nodes[id]) !== JSON.stringify(stored_nodes[id])
	);
	if (unlinked_ids.length)
		throw new Error(
			`New or changed nodes are not linked from the page: ${unlinked_ids.join(', ')}. Add each id to its parent's node, node_array, or mark/annotation range and include the changed parent.`
		);

	const { page_doc, version } = await persist_combined_page(input.document_id, nodes, {
		expected_version: input.expected_version
	});
	const slug = get_active_slug_for_document_id(input.document_id);
	return {
		ok: true,
		document_id: input.document_id,
		page_href: slug ? `/${slug}` : '/',
		title: extract_page_metadata(page_doc).title,
		version
	};
}
