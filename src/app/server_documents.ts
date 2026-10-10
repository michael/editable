import { createHash } from 'node:crypto';
import slugify from 'slugify';
import { validate_document } from 'svedit';
import type { Attachment, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
import type { StatementSync } from 'node:sqlite';
import { db, with_transaction, delete_orphaned_assets, touch_asset } from '#app/services.js';
import { document_schema } from '#app/document_schema.js';
import { collect_node_ids_in_order } from '#lib/document_graph.js';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { rebuild_asset_refs } from './server_asset_refs.js';
import { cleanup_translations } from './server_translations.js';
import { parse_internal_page_href } from './document_links.js';
import { languages } from './server_languages.js';
import { is_reserved_language_slug } from './languages.js';
import { is_reserved_route_slug } from './route_slugs.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';

export type DocumentData = {
	document_id: string;
	nodes: Record<string, DocumentNode>;
};

export type DocumentRow = {
	document_id: string;
	type: string;
	data: string;
	created_at: string | null | undefined;
	updated_at: string | null | undefined;
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

export function get_optional_doc_from_db(document_id: string): DocumentData | null {
	const doc_row = db
		.prepare('SELECT data FROM documents WHERE document_id = ?')
		.get(document_id) as { data: string } | undefined;

	if (!doc_row) return null;
	return JSON.parse(doc_row.data);
}

export function get_doc_from_db(document_id: string): DocumentData {
	const doc = get_optional_doc_from_db(document_id);
	if (!doc) {
		throw new Error(`Document not found: ${document_id}`);
	}
	return doc;
}

export function get_home_page_id_from_db(): string | null {
	const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('home_page_id') as
		{ value: string } | undefined;

	return row?.value ?? null;
}

export function is_home_page_document_id(document_id: string): boolean {
	return get_home_page_id_from_db() === document_id;
}

export function get_active_slug_for_document_id(document_id: string): string | null {
	const row = db
		.prepare('SELECT slug FROM document_slugs WHERE document_id = ? AND is_active = 1')
		.get(document_id) as unknown as { slug: string } | undefined;

	return row?.slug ?? null;
}

/** Resolve an active or historical slug to its document and current active slug. */
export function resolve_slug(
	slug: string
): { document_id: string; is_active: boolean; active_slug: string } | null {
	const row = db
		.prepare('SELECT document_id, is_active FROM document_slugs WHERE slug = ?')
		.get(slug) as unknown as { document_id: string; is_active: number } | undefined;

	if (!row) return null;

	const active_slug = get_active_slug_for_document_id(row.document_id);
	if (!active_slug) {
		throw new Error(`Active slug not found for document: ${row.document_id}`);
	}

	return {
		document_id: row.document_id,
		is_active: row.is_active === 1,
		active_slug
	};
}

/**
 * Give a new page its first active slug, derived from base (a requested slug
 * or the page title) and suffixed when it is taken or reserved.
 */
export function create_page_slug(document_id: string, base: string): string {
	const base_slug = slugify(base, { lower: true, strict: true, trim: true }) || document_id;
	const slug_exists_stmt = db.prepare('SELECT document_id FROM document_slugs WHERE slug = ?');

	let slug = base_slug;
	let suffix = 2;
	while (
		slug_exists_stmt.get(slug) ||
		is_reserved_route_slug(slug) ||
		is_reserved_markdown_slug(slug) ||
		is_reserved_language_slug(slug, languages)
	) {
		slug = `${base_slug}-${suffix}`;
		suffix += 1;
	}

	db.prepare(
		'INSERT INTO document_slugs (slug, document_id, is_active, created_at) VALUES (?, ?, 1, ?)'
	).run(slug, document_id, new Date().toISOString());
	return slug;
}

export function normalize_internal_page_href(
	href: string,
	source_document_id: string | undefined
): string | null {
	const parsed = parse_internal_page_href(href, languages);
	if (!parsed) return null;

	const resolved = resolve_slug(parsed.slug);
	if (!resolved) return null;
	if (source_document_id && resolved.document_id === source_document_id) return null;

	return resolved.document_id;
}

export function collect_document_refs(
	nodes: Record<string, DocumentNode>,
	node_ids: Iterable<string>,
	source_document_id: string
): string[] {
	const refs: string[] = [];
	const seen_refs = new Set<string>();

	function add_ref(href: unknown) {
		if (typeof href !== 'string') return;
		const target_document_id = normalize_internal_page_href(href, source_document_id);
		if (target_document_id && !seen_refs.has(target_document_id)) {
			seen_refs.add(target_document_id);
			refs.push(target_document_id);
		}
	}

	for (const node_id of node_ids) {
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

	return refs;
}

export function update_document_refs(
	source_document_id: string,
	target_document_ids: string[],
	delete_stmt: StatementSync,
	insert_stmt: StatementSync
) {
	delete_stmt.run(source_document_id);
	for (const [ref_order, target_document_id] of target_document_ids.entries()) {
		insert_stmt.run(target_document_id, source_document_id, ref_order);
	}
}

export function get_shared_root_ids(page_doc: DocumentData): {
	banner_root_id: string | null;
	nav_root_id: string | null;
	footer_root_id: string | null;
} {
	const page_node = page_doc.nodes[page_doc.document_id];

	return {
		banner_root_id: typeof page_node?.banner === 'string' ? page_node.banner : null,
		nav_root_id: typeof page_node?.nav === 'string' ? page_node.nav : null,
		footer_root_id: typeof page_node?.footer === 'string' ? page_node.footer : null
	};
}

/** Stitch the shared documents (banner, nav, footer) into a page document. */
export function combine_page_document(page_doc: DocumentData): DocumentData {
	const page_node = page_doc.nodes[page_doc.document_id];
	const nodes = { ...page_doc.nodes };
	for (const type of shared_document_types) {
		const shared_id = page_node?.[type];
		if (typeof shared_id === 'string') Object.assign(nodes, get_doc_from_db(shared_id).nodes);
	}
	return { document_id: page_doc.document_id, nodes };
}

export function get_combined_document(document_id: string): DocumentData {
	return combine_page_document(get_doc_from_db(document_id));
}

function get_referenced_asset_ids(): Set<string> {
	const rows = db.prepare('SELECT DISTINCT asset_id FROM asset_refs').all() as unknown as Array<{
		asset_id: string;
	}>;
	return new Set(rows.map((row) => row.asset_id));
}

/**
 * Run a write and then remove asset files no longer referenced by any
 * document. A cleanup failure must not fail the request.
 *
 * Assets that lost their last reference in the write get their orphan clock
 * started via touch_asset, so the grace period runs from dereferencing — not
 * from upload.
 */
export async function with_asset_cleanup<T>(write: () => T): Promise<T> {
	const refs_before = get_referenced_asset_ids();
	const result = write();

	try {
		const refs_after = get_referenced_asset_ids();

		for (const asset_id of refs_before) {
			if (!refs_after.has(asset_id)) {
				await touch_asset(asset_id);
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
	const roots = [document_id, ...shared_document_types.map((type) => page_node[type] as string)];
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

/**
 * Content hash of a page and its shared (banner, nav, footer) documents as
 * stored. It changes whenever any of them changes, however it was written.
 */
export function get_page_version(document_id: string): string | null {
	const select_data = db.prepare('SELECT data FROM documents WHERE document_id = ?');
	const page_row = select_data.get(document_id) as { data: string } | undefined;
	if (!page_row) return null;

	const page_node = (JSON.parse(page_row.data) as DocumentData).nodes[document_id];
	const hash = createHash('sha256').update(page_row.data);
	for (const type of shared_document_types) {
		const shared_id = page_node?.[type];
		const row = typeof shared_id === 'string' ? select_data.get(shared_id) : undefined;
		hash.update('\0').update((row as { data: string } | undefined)?.data ?? '');
	}
	return hash.digest('hex');
}

/**
 * Validate a combined page graph and split it back into its page and shared
 * (banner, nav, footer) documents. Only new or changed documents are written,
 * so saving one page does not touch unchanged shared documents. When
 * expected_version is given, the save is rejected if the stored page moved on.
 * on_write runs inside the write transaction, after the documents are stored.
 */
export async function persist_combined_page(
	document_id: string,
	nodes: Record<string, DocumentNode>,
	{
		expected_version,
		on_write
	}: { expected_version?: string; on_write?: (page_doc: DocumentData) => void } = {}
): Promise<{ page_doc: DocumentData; version: string }> {
	const page_node = nodes[document_id];
	if (page_node?.type !== 'page') {
		throw new InvalidDocumentError(`Root node must be a page: ${document_id}`);
	}

	// Enforce document invariants at the write boundary — a malformed graph
	// must never be persisted, since it would break rendering for visitors.
	try {
		validate_document({ document_id, nodes }, document_schema);
		validate_single_ownership(document_id, nodes);
	} catch (err) {
		throw new InvalidDocumentError(
			`Invalid document: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}

	// validate_document guarantees these required references resolve to existing nodes.
	const shared_roots = shared_document_types.map((type) => ({
		document_id: page_node[type] as string,
		type
	}));
	const exclude_roots = new Set(shared_roots.map((root) => root.document_id));
	const documents = [{ document_id, type: 'page' }, ...shared_roots].map((root) => {
		const node_ids = collect_node_ids(
			root.document_id,
			nodes,
			root.type === 'page' ? exclude_roots : undefined
		);
		const doc = extract_document(root.document_id, node_ids, nodes);
		return { ...root, node_ids, doc, data: JSON.stringify(doc) };
	});

	// Everything up to the write runs synchronously, so no other save can interleave.
	if (expected_version !== undefined && get_page_version(document_id) !== expected_version) {
		throw new VersionConflictError();
	}

	const select_row = db.prepare('SELECT type, data FROM documents WHERE document_id = ?');
	const changed_documents = documents.filter(({ document_id, type, doc }) => {
		const row = select_row.get(document_id) as { type: string; data: string } | undefined;
		if (row && row.type !== type) {
			throw new InvalidDocumentError(`Document ${document_id} is a ${row.type}, not a ${type}.`);
		}
		return !row || !has_same_nodes(JSON.parse(row.data), doc);
	});

	const upsert = db.prepare(
		'INSERT INTO documents (document_id, type, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
	);
	const delete_document_refs = db.prepare('DELETE FROM document_refs WHERE source_document_id = ?');
	const insert_document_ref = db.prepare(
		'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
	);

	const page_doc = documents[0].doc;

	const version = await with_asset_cleanup(() =>
		with_transaction(() => {
			// created_at is only written on insert; the upsert keeps the existing value on conflict.
			const now_iso = new Date().toISOString();

			for (const { document_id, type, node_ids, data } of changed_documents) {
				upsert.run(document_id, type, data, now_iso, now_iso);
				update_document_refs(
					document_id,
					collect_document_refs(nodes, node_ids, document_id),
					delete_document_refs,
					insert_document_ref
				);
				cleanup_translations(document_id);
				rebuild_asset_refs(document_id);
			}

			on_write?.(page_doc);
			return get_page_version(document_id)!;
		})
	);

	// Fire-and-forget: write-driven trigger for the daily full-database
	// safety snapshot (never throws, never blocks the save).
	void snapshot_if_stale();

	return { page_doc, version };
}
