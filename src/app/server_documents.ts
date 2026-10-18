import slugify from 'slugify';
import { validate_document } from 'svedit';
import type { Attachment, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
import { backend } from '#app/services.js';
import {
	asset_refs_of,
	delete_orphaned_assets,
	referenced_asset_ids
} from './server_asset_refs.js';
import { document_schema } from '#app/document_schema.js';
import { collect_node_ids_in_order } from '#lib/document_graph.js';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { clean_translations } from './server_translations.js';
import { assert_safe_hrefs, parse_internal_page_href } from './document_links.js';
import { RESERVED_ROUTE_SLUGS } from './config.js';
import { site } from './server_site.js';
import { ConflictError, type DocumentRecord, type SlugRecord } from '#lib/server/backend.js';
import { is_reserved_language_slug } from './languages.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';

export type DocumentData = {
	document_id: string;
	nodes: Record<string, DocumentNode>;
};

/** Page properties that reference shared documents, named after their document type. */
export const shared_document_types = ['banner', 'nav', 'footer'] as const;

export class InvalidDocumentError extends Error {}

export class VersionConflictError extends Error {
	constructor() {
		super('The page or its shared banner, navigation, or footer changed since it was loaded.');
	}
}

export function get_attached_ranges(
	value: { marks?: Attachment[]; annotations?: Attachment[] } | null | undefined
): Attachment[] {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

/**
 * Collect all node ids reachable from a root node by walking node/node_array
 * properties and mark/annotation references.
 */
export function collect_node_ids(
	root_id: string,
	nodes: Record<string, DocumentNode>,
	exclude_roots?: Set<string>
): Set<string> {
	return new Set(collect_node_ids_in_order(root_id, nodes, document_schema, exclude_roots));
}

export function extract_document(
	document_id: string,
	node_ids: Set<string>,
	all_nodes: Record<string, DocumentNode>
): DocumentData {
	const nodes: Record<string, DocumentNode> = {};
	for (const id of node_ids) {
		if (all_nodes[id]) {
			nodes[id] = all_nodes[id];
		}
	}
	return { document_id, nodes };
}

export async function get_optional_doc_from_db(document_id: string): Promise<DocumentData | null> {
	return (await backend.get_document(document_id))?.data ?? null;
}

export async function get_doc_from_db(document_id: string): Promise<DocumentData> {
	const doc = await get_optional_doc_from_db(document_id);
	if (!doc) {
		throw new Error(`Document not found: ${document_id}`);
	}
	return doc;
}

export function get_home_page_id_from_db(): Promise<string | null> {
	return backend.get_setting('home_page_id');
}

export async function is_home_page_document_id(document_id: string): Promise<boolean> {
	return (await get_home_page_id_from_db()) === document_id;
}

export function get_active_slug_for_document_id(document_id: string): Promise<string | null> {
	return backend.get_active_slug(document_id);
}

/** Resolve an active or historical slug to its document and current active slug. */
export function resolve_slug(slug: string) {
	return backend.resolve_slug(slug);
}

export function is_reserved_route_slug(slug: string) {
	return RESERVED_ROUTE_SLUGS.has(slug);
}

/**
 * A new page's first active slug, derived from base (a requested slug or the
 * page title) and suffixed when it is taken or reserved.
 */
async function new_page_slug(document_id: string, base: string): Promise<SlugRecord> {
	const base_slug = slugify(base, { lower: true, strict: true, trim: true }) || document_id;

	let slug = base_slug;
	let suffix = 2;
	while (
		(await backend.resolve_slug(slug)) ||
		is_reserved_route_slug(slug) ||
		is_reserved_markdown_slug(slug) ||
		is_reserved_language_slug(slug, site.languages)
	) {
		slug = `${base_slug}-${suffix}`;
		suffix += 1;
	}
	return { slug, document_id, is_active: true, created_at: new Date().toISOString() };
}

/** Every slug, active or a redirect, and the document it leads to. */
export async function slug_targets(): Promise<Map<string, string>> {
	return new Map((await backend.list_slugs()).map((record) => [record.slug, record.document_id]));
}

/** The pages a document links to, in document order, given where each slug leads. */
export function document_refs_of(document: DocumentData, slugs: Map<string, string>) {
	const { document_id, nodes } = document;
	const target_ids: string[] = [];

	function add_ref(href: unknown) {
		if (typeof href !== 'string') return;
		const parsed = parse_internal_page_href(href, site.languages);
		const target_id = parsed && slugs.get(parsed.slug);
		if (target_id && target_id !== document_id && !target_ids.includes(target_id))
			target_ids.push(target_id);
	}

	for (const node_id of collect_node_ids(document_id, nodes)) {
		const node = nodes[node_id];
		if (!node) continue;
		add_ref(node.href);
		const type_schema: NodeSchema | undefined = document_schema[node.type];
		if (!type_schema) continue;
		for (const [prop_name, prop_def] of Object.entries<PropertyDefinition>(
			type_schema.properties
		)) {
			if (prop_def.type !== 'text') continue;
			for (const range of get_attached_ranges(node[prop_name])) {
				const range_node = range?.node_id ? nodes[range.node_id] : null;
				if (range_node?.type === 'link') add_ref(range_node.href);
			}
		}
	}
	return { document_id, target_ids };
}

/** The shared documents (banner, nav, footer) a page refers to; none for a shared document. */
function shared_ids_of(doc: DocumentData): string[] {
	const root = doc.nodes[doc.document_id];
	return shared_document_types
		.map((type) => root?.[type])
		.filter((id): id is string => typeof id === 'string');
}

/** Stitch the shared documents (banner, nav, footer) into a page document. */
export async function combine_page_document(page_doc: DocumentData): Promise<DocumentData> {
	const shared = await Promise.all(shared_ids_of(page_doc).map(get_doc_from_db));
	return {
		document_id: page_doc.document_id,
		nodes: Object.assign({}, page_doc.nodes, ...shared.map((doc) => doc.nodes))
	};
}

export async function get_combined_document(document_id: string): Promise<DocumentData> {
	return combine_page_document(await get_doc_from_db(document_id));
}

/**
 * Run a write and then remove asset files no longer referenced by any
 * document. A cleanup failure must not fail the request.
 *
 * Assets that lost their last reference in the write get their orphan clock
 * started via touch_asset, so the grace period runs from dereferencing — not
 * from upload.
 */
export async function with_asset_cleanup<T>(write: () => Promise<T>): Promise<T> {
	const refs_before = await referenced_asset_ids();
	const result = await write();

	try {
		const refs_after = await referenced_asset_ids();

		for (const asset_id of refs_before) {
			if (!refs_after.has(asset_id)) {
				await backend.touch_asset(asset_id);
			}
		}

		await delete_orphaned_assets(refs_after);
	} catch (err) {
		console.error('Orphaned asset cleanup failed:', err);
	}

	return result;
}

/**
 * Throw if any node is referenced by more than one field, array entry, or
 * mark/annotation range. Page references to shared documents are separate
 * document roots and do not count as ownership.
 */
export function validate_single_ownership(
	document_id: string,
	nodes: Record<string, DocumentNode>
) {
	const page_node = nodes[document_id];
	const roots = [document_id, ...shared_document_types.map((type) => page_node[type])].filter(
		(id): id is string => typeof id === 'string'
	);
	const owners = new Map<string, string>(roots.map((id) => [id, `document root ${id}`]));
	const visited = new Set<string>();
	const stack = [...roots];

	while (stack.length) {
		const id = stack.pop();
		if (!id || visited.has(id)) continue;
		visited.add(id);

		const node = nodes[id];
		const type_schema: NodeSchema | undefined = node ? document_schema[node.type] : undefined;
		if (!type_schema) continue;

		for (const [prop_name, prop_def] of Object.entries<PropertyDefinition>(
			type_schema.properties
		)) {
			if (id === document_id && (shared_document_types as readonly string[]).includes(prop_name))
				continue;

			const value = node[prop_name];
			const range_ids = (ranges: Attachment[]) =>
				ranges.flatMap((range) => (range.node_id ? [range.node_id] : []));
			const target_ids: string[] = [];
			if (prop_def.type === 'node' && typeof value === 'string') target_ids.push(value);
			if (prop_def.type === 'node_array' && value)
				target_ids.push(...value.nodes, ...range_ids(get_attached_ranges(value)));
			if (prop_def.type === 'text' && value)
				target_ids.push(...range_ids(get_attached_ranges(value)));

			for (const target_id of target_ids) {
				const prior_owner = owners.get(target_id);
				if (prior_owner) {
					throw new Error(
						`Node ${target_id} has multiple owners: ${prior_owner} and ${id}.${prop_name}.`
					);
				}
				owners.set(target_id, `${id}.${prop_name}`);
				stack.push(target_id);
			}
		}
	}
}

/** Compare node contents, ignoring the order nodes are stored in. */
function has_same_nodes(a: DocumentData, b: DocumentData): boolean {
	const ids = Object.keys(a.nodes);
	return (
		ids.length === Object.keys(b.nodes).length &&
		ids.every((id) => JSON.stringify(a.nodes[id]) === JSON.stringify(b.nodes[id]))
	);
}

/** A page's version together with its shared documents', from their stored records. */
function version_of(records: DocumentRecord[]) {
	return records.map((record) => record.version).join('.');
}

/**
 * The version of a document as stored, and for a page also of its shared
 * (banner, nav, footer) documents. It changes whenever any of them is written.
 */
export async function get_document_version(document_id: string): Promise<string | null> {
	const page = await backend.get_document(document_id);
	if (!page) return null;
	const shared = await Promise.all(shared_ids_of(page.data).map((id) => backend.get_document(id)));
	return version_of([page, ...shared.filter((record) => record !== null)]);
}

/**
 * Validate a document graph and store it: a page, which the editor sends
 * combined with its shared (banner, nav, footer) documents and which is split
 * back into them, or a shared document on its own. Only new or changed
 * documents are written, so saving one page does not touch unchanged shared
 * documents. When expected_version is given, the save is rejected if the
 * stored documents moved on. A new page gets its first slug from slug_base.
 */
export async function persist_document(
	document_id: string,
	nodes: Record<string, DocumentNode>,
	{ expected_version, slug_base }: { expected_version?: string; slug_base?: string } = {}
): Promise<{ doc: DocumentData; version: string }> {
	const root_type: string | undefined = nodes[document_id]?.type;
	if (root_type !== 'page' && !(shared_document_types as readonly string[]).includes(root_type!)) {
		throw new InvalidDocumentError(
			`Root node must be a page, banner, nav, or footer: ${document_id}`
		);
	}

	// Enforce document invariants at the write boundary — a malformed graph
	// must never be persisted, since it would break rendering for visitors.
	try {
		validate_document({ document_id, nodes }, document_schema);
		validate_single_ownership(document_id, nodes);
		assert_safe_hrefs(nodes);
	} catch (err) {
		throw new InvalidDocumentError(
			`Invalid document: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}

	// validate_document guarantees a page's shared references resolve to existing nodes.
	const shared_ids = shared_ids_of({ document_id, nodes });
	const exclude_roots = new Set(shared_ids);
	const documents = [document_id, ...shared_ids].map((id) => ({
		document_id: id,
		type: nodes[id].type,
		doc: extract_document(id, collect_node_ids(id, nodes, exclude_roots), nodes)
	}));
	const doc = documents[0].doc;

	const records = await Promise.all(
		documents.map(({ document_id }) => backend.get_document(document_id))
	);
	for (const [index, record] of records.entries())
		if (record && record.type !== documents[index].type)
			throw new InvalidDocumentError(
				`Document ${record.document_id} is a ${record.type}, not a ${documents[index].type}.`
			);
	if (
		expected_version !== undefined &&
		(await get_document_version(document_id)) !== expected_version
	)
		throw new VersionConflictError();

	const changed = documents
		.map((document, index) => ({ ...document, record: records[index] }))
		.filter(({ record, doc }) => !record || !has_same_nodes(record.data, doc));
	const changed_ids = changed.map((document) => document.document_id);
	const [slugs, translations, first_slug] = await Promise.all([
		slug_targets(),
		backend.list_translations({ document_ids: changed_ids }),
		slug_base && !records[0] ? new_page_slug(document_id, slug_base) : null
	]);
	if (first_slug) slugs.set(first_slug.slug, document_id);

	const now = new Date().toISOString();
	const cleaned = changed.map((document) =>
		clean_translations(
			document.doc,
			translations.filter((row) => row.document_id === document.document_id)
		)
	);

	await with_asset_cleanup(() =>
		backend.save_documents({
			expect: Object.fromEntries(
				documents.map((document, index) => [document.document_id, records[index]?.version ?? null])
			),
			documents: changed.map(({ document_id, type, doc, record }) => ({
				document_id,
				type,
				data: doc,
				// A document keeps its created_at; only new ones get stamped now.
				created_at: record?.created_at ?? now,
				updated_at: now
			})),
			document_refs: changed.map(({ doc }) => document_refs_of(doc, slugs)),
			asset_refs: changed.map(({ doc }, index) => asset_refs_of(doc, cleaned[index].kept)),
			translations: {
				put: cleaned.flatMap((result) => result.put),
				delete: cleaned.flatMap((result) => result.delete)
			},
			slugs: first_slug ? [first_slug] : []
		})
	).catch((error) => {
		throw error instanceof ConflictError ? new VersionConflictError() : error;
	});

	// Fire-and-forget: write-driven trigger for the daily full-database
	// safety snapshot (never throws, never blocks the save).
	void snapshot_if_stale();

	return { doc, version: (await get_document_version(document_id))! };
}
