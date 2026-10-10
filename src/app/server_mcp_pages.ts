import { fill_node_defaults, type DocumentNode, type PropertyDefinition } from 'svedit';
import { languages } from './server_languages.js';
import { language_path } from './languages.js';
import { parse_internal_page_href } from './document_links.js';
import { MEDIA_DEFAULTS, document_schema } from './document_schema.js';
import nanoid from './nanoid.js';
import { extract_page_metadata } from './page_metadata.js';
import {
	type DocumentData,
	collect_node_ids,
	combine_page_document,
	create_page_slug,
	get_active_slug_for_document_id,
	get_doc_from_db,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	get_page_version,
	persist_combined_page,
	resolve_slug,
	shared_document_types
} from './server_documents.js';

/**
 * Resolve the ways agents refer to pages: a document id, a path, or a full URL
 * (whose host is ignored), including language prefixes and old slugs.
 */
function resolve_page_id(page: string): string | null {
	if (get_optional_doc_from_db(page)?.nodes[page]?.type === 'page') return page;

	let href = page.trim();
	if (/^https?:\/\//i.test(href)) {
		const url = URL.parse(href);
		if (!url) return null;
		href = url.pathname;
	}
	const pathname = href.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
	if (language_path(pathname, languages).pathname === '/') return get_home_page_id_from_db();

	const parsed = parse_internal_page_href(pathname, languages);
	return parsed ? (resolve_slug(parsed.slug)?.document_id ?? null) : null;
}

function page_href_for(document_id: string): string {
	const slug = get_active_slug_for_document_id(document_id);
	return slug ? `/${slug}` : '/';
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

export function read_mcp_page(page: string) {
	const document_id = resolve_page_id(page);
	const page_doc = document_id && get_optional_doc_from_db(document_id);
	if (!document_id || !page_doc)
		throw new Error(
			`Page not found: ${page}. Use a path such as /about, a full URL, or a document_id from list_pages.`
		);
	return {
		document: combine_page_document(page_doc),
		page_href: page_href_for(document_id),
		version: get_page_version(document_id)
	};
}

/** Fill omitted properties of every submitted node with schema defaults. */
function fill_submitted_nodes(nodes: Record<string, unknown>): Record<string, DocumentNode> {
	return Object.fromEntries(
		Object.entries(nodes as Record<string, DocumentNode>).map(([id, node]) => [
			id,
			fill_defaults(node)
		])
	);
}

/** Submitted nodes that end up unreachable were almost certainly meant to be linked. */
function assert_linked(document_id: string, nodes: Record<string, DocumentNode>, ids: string[]) {
	const reachable_ids = collect_node_ids(document_id, nodes);
	const unlinked_ids = ids.filter((id) => !reachable_ids.has(id));
	if (unlinked_ids.length)
		throw new Error(
			`New or changed nodes are not linked from the page: ${unlinked_ids.join(', ')}. Add each id to its parent's node, node_array, or mark/annotation range and include the changed parent.`
		);
}

function page_result(document_id: string, page_doc: DocumentData, version: string) {
	return {
		ok: true,
		document_id,
		page_href: page_href_for(document_id),
		title: extract_page_metadata(page_doc).title,
		version
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
	// are discarded when the page is split back into its documents.
	const submitted_nodes = fill_submitted_nodes(input.nodes);
	const stored_nodes = combine_page_document(current).nodes;
	const nodes = { ...stored_nodes, ...submitted_nodes };
	for (const type of shared_document_types) {
		if (nodes[input.document_id]?.[type] !== current.nodes[input.document_id][type])
			throw new Error(`The shared ${type} reference cannot be changed through save_page.`);
	}
	// Unchanged unreachable nodes are deletions from a resent document.
	assert_linked(
		input.document_id,
		nodes,
		Object.keys(submitted_nodes).filter(
			(id) => JSON.stringify(submitted_nodes[id]) !== JSON.stringify(stored_nodes[id])
		)
	);

	const { page_doc, version } = await persist_combined_page(input.document_id, nodes, {
		expected_version: input.expected_version
	});
	return page_result(input.document_id, page_doc, version);
}

export async function create_mcp_page(input: {
	document_id: string;
	nodes: Record<string, unknown>;
	slug?: string;
}) {
	const { document_id } = input;
	if (get_optional_doc_from_db(document_id))
		throw new Error(`A document with id ${document_id} already exists. Choose a new id.`);

	const submitted_nodes = fill_submitted_nodes(input.nodes);
	const page_node = submitted_nodes[document_id];
	if (page_node?.type !== 'page')
		throw new Error(`nodes must include the page node { id: "${document_id}", type: "page" }.`);

	// Like pages created in the editor, new pages use the current shared documents.
	const home_page_id = get_home_page_id_from_db();
	const home_doc = home_page_id ? get_optional_doc_from_db(home_page_id) : null;
	if (!home_doc) throw new Error('The home page is not configured.');
	const shared_nodes: Record<string, DocumentNode> = {};
	for (const type of shared_document_types) {
		const shared_id = home_doc.nodes[home_doc.document_id][type] as string;
		page_node[type] = shared_id;
		Object.assign(shared_nodes, get_doc_from_db(shared_id).nodes);
	}
	const shared_ids = Object.keys(submitted_nodes).filter((id) => id in shared_nodes);
	if (shared_ids.length)
		throw new Error(
			`Node ids belong to the shared banner, navigation, or footer: ${shared_ids.join(', ')}. Leave shared nodes out of create_page.`
		);

	// Every page has a preview image node, empty until an image is chosen.
	if (page_node.image === undefined) {
		page_node.image = nanoid();
		submitted_nodes[page_node.image] = { id: page_node.image, type: 'image', ...MEDIA_DEFAULTS };
	}

	const nodes = { ...shared_nodes, ...submitted_nodes };
	assert_linked(document_id, nodes, Object.keys(submitted_nodes));

	const { page_doc, version } = await persist_combined_page(document_id, nodes, {
		on_write: (page_doc) =>
			create_page_slug(
				document_id,
				input.slug || extract_page_metadata(page_doc).title || 'Untitled page'
			)
	});
	return page_result(document_id, page_doc, version);
}
