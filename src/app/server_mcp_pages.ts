import {
	validate_document,
	type Attachment,
	type DocumentNode,
	type NodeSchema,
	type PropertyDefinition
} from 'svedit';
import { db, with_transaction, delete_orphaned_assets, touch_asset } from './services.js';
import { document_schema } from './document_schema.js';
import { collect_node_ids_in_order } from '#lib/document_graph.js';
import { rebuild_asset_refs } from './server_asset_refs.js';
import { cleanup_translations } from './server_translations.js';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { extract_page_metadata } from './page_metadata.js';
import { parse_internal_page_href } from './document_links.js';
import { languages } from './server_languages.js';

type DocumentData = { document_id: string; nodes: Record<string, DocumentNode> };
type DocumentRow = { data: string; updated_at: string | null };

function get_document(document_id: string): DocumentData {
	const row = db.prepare('SELECT data FROM documents WHERE document_id = ?').get(document_id) as
		{ data: string } | undefined;
	if (!row) throw new Error(`Document not found: ${document_id}`);
	return JSON.parse(row.data) as DocumentData;
}

function get_combined_nodes(page_doc: DocumentData): Record<string, DocumentNode> {
	const nodes = { ...page_doc.nodes };
	for (const key of ['banner', 'nav', 'footer'] as const) {
		const shared_id = page_doc.nodes[page_doc.document_id]?.[key];
		if (typeof shared_id === 'string') Object.assign(nodes, get_document(shared_id).nodes);
	}
	return nodes;
}

function page_for_slug(page_href: string): { document_id: string; slug: string } | null {
	if (page_href === '/') {
		const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('home_page_id') as
			{ value: string } | undefined;
		return row ? { document_id: row.value, slug: '/' } : null;
	}
	const slug = page_href.replace(/^\/+/, '').replace(/\/+$/, '');
	const row = db
		.prepare('SELECT document_id FROM document_slugs WHERE slug = ? AND is_active = 1')
		.get(slug) as { document_id: string } | undefined;
	return row ? { document_id: row.document_id, slug: `/${slug}` } : null;
}

export function read_mcp_page(page_href: string) {
	const page = page_for_slug(page_href);
	if (!page) throw new Error(`Page not found: ${page_href}`);
	const page_doc = get_document(page.document_id);
	const nodes = get_combined_nodes(page_doc);
	const expected_updated_at: Record<string, string | null> = {};
	for (const key of ['banner', 'nav', 'footer'] as const) {
		const shared_id = page_doc.nodes[page.document_id]?.[key];
		if (typeof shared_id === 'string') {
			const shared_row = db
				.prepare('SELECT updated_at FROM documents WHERE document_id = ?')
				.get(shared_id) as { updated_at: string | null } | undefined;
			expected_updated_at[shared_id] = shared_row?.updated_at ?? null;
		}
	}
	const row = db
		.prepare('SELECT updated_at FROM documents WHERE document_id = ?')
		.get(page.document_id) as { updated_at: string | null } | undefined;
	expected_updated_at[page.document_id] = row?.updated_at ?? null;
	return {
		document: { document_id: page.document_id, nodes },
		page_href: page.slug,
		expected_updated_at
	};
}

function attached_ranges(
	value: { marks?: Attachment[]; annotations?: Attachment[] } | null | undefined
) {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

function document_refs(
	nodes: Record<string, DocumentNode>,
	ids: Iterable<string>,
	source_id: string
) {
	const refs = new Set<string>();
	for (const id of ids) {
		const node = nodes[id];
		if (!node) continue;
		const add_href = (href: unknown) => {
			if (typeof href !== 'string') return;
			const parsed = parse_internal_page_href(href, languages);
			if (!parsed) return;
			const target = db
				.prepare('SELECT document_id FROM document_slugs WHERE slug = ?')
				.get(parsed.slug) as { document_id: string } | undefined;
			if (target && target.document_id !== source_id) refs.add(target.document_id);
		};
		add_href(node.href);
		const schema: NodeSchema | undefined = document_schema[node.type];
		if (!schema) continue;
		for (const [prop, def] of Object.entries<PropertyDefinition>(schema.properties)) {
			if (def.type !== 'text') continue;
			for (const range of attached_ranges(node[prop])) {
				const link = range.node_id ? nodes[range.node_id] : undefined;
				if (link?.type === 'link') add_href(link.href);
			}
		}
	}
	return [...refs];
}

function reachable(root: string, nodes: Record<string, DocumentNode>, excluded?: Set<string>) {
	return new Set(collect_node_ids_in_order(root, nodes, document_schema, excluded));
}

function validate_single_ownership(document_id: string, nodes: Record<string, DocumentNode>) {
	const roots = [
		document_id,
		...(['banner', 'nav', 'footer'] as const).map((key) => nodes[document_id][key] as string)
	];
	const ownership = new Map<string, string>();
	const visited = new Set<string>();
	for (const root_id of roots) ownership.set(root_id, `document root ${root_id}`);
	const stack = [...roots];
	while (stack.length) {
		const id = stack.pop();
		if (!id || visited.has(id)) continue;
		visited.add(id);
		const node = nodes[id];
		if (!node) continue;
		const schema = document_schema[node.type];
		if (!schema) continue;
		for (const [property, definition] of Object.entries<PropertyDefinition>(schema.properties)) {
			const value = node[property];
			const refs: string[] = [];
			if (definition.type === 'node' && typeof value === 'string') refs.push(value);
			if (definition.type === 'node_array' && value) {
				refs.push(
					...value.nodes,
					...attached_ranges(value).flatMap((range) => (range.node_id ? [range.node_id] : []))
				);
			}
			if (definition.type === 'text' && value)
				refs.push(
					...attached_ranges(value).flatMap((range) => (range.node_id ? [range.node_id] : []))
				);
			for (const target_id of refs) {
				// Page references to shared documents establish separate document roots.
				if (id === document_id && ['banner', 'nav', 'footer'].includes(property)) continue;
				const prior_owner = ownership.get(target_id);
				if (prior_owner)
					throw new Error(
						`Node ${target_id} has multiple owners: ${prior_owner} and ${id}.${property}.`
					);
				ownership.set(target_id, `${id}.${property}`);
				stack.push(target_id);
			}
		}
	}
}

function extract(
	document_id: string,
	ids: Set<string>,
	nodes: Record<string, DocumentNode>
): DocumentData {
	return {
		document_id,
		nodes: Object.fromEntries([...ids].filter((id) => nodes[id]).map((id) => [id, nodes[id]]))
	};
}

async function cleanup_assets(before: Set<string>) {
	try {
		const rows = db.prepare('SELECT DISTINCT asset_id FROM asset_refs').all() as Array<{
			asset_id: string;
		}>;
		const after = new Set(rows.map((row) => row.asset_id));
		for (const id of before) if (!after.has(id)) await touch_asset(id);
		await delete_orphaned_assets(after);
	} catch (error) {
		console.error('Orphaned asset cleanup failed:', error);
	}
}

export async function save_mcp_page(input: {
	document_id: string;
	nodes: Record<string, unknown>;
	expected_updated_at: Record<string, string | null>;
}) {
	const current_row = db
		.prepare('SELECT data, updated_at FROM documents WHERE document_id = ? AND type = ?')
		.get(input.document_id, 'page') as DocumentRow | undefined;
	if (!current_row) throw new Error(`Existing page not found: ${input.document_id}`);
	if (current_row.updated_at !== input.expected_updated_at[input.document_id])
		throw new Error('Page changed since it was read. Read it again before saving.');
	// MCP writes are patches: overlay submitted node ids onto the latest full
	// document. Omitting a node leaves it untouched; unreachable nodes are
	// discarded later when the reachable page/shared documents are extracted.
	const nodes = {
		...get_combined_nodes(JSON.parse(current_row.data) as DocumentData),
		...(structuredClone(input.nodes) as Record<string, DocumentNode>)
	};
	if (nodes[input.document_id]?.type !== 'page')
		throw new Error('Root node must be a page matching document_id.');
	const current = JSON.parse(current_row.data) as DocumentData;
	for (const key of ['banner', 'nav', 'footer'] as const) {
		if (nodes[input.document_id]?.[key] !== current.nodes[input.document_id]?.[key])
			throw new Error(`The shared ${key} reference cannot be changed through save_page.`);
	}
	const reachable_ids = reachable(input.document_id, nodes);
	for (const id of Object.keys(nodes)) {
		if (!reachable_ids.has(id)) delete nodes[id];
	}
	try {
		validate_document({ document_id: input.document_id, nodes }, document_schema);
		validate_single_ownership(input.document_id, nodes);
	} catch (error) {
		throw new Error(`Invalid document: ${error instanceof Error ? error.message : String(error)}`, {
			cause: error
		});
	}
	const shared = (['banner', 'nav', 'footer'] as const).map((type) => {
		const document_id = nodes[input.document_id][type] as string;
		const row = db.prepare('SELECT type FROM documents WHERE document_id = ?').get(document_id) as
			{ type: string } | undefined;
		if (!row || row.type !== type)
			throw new Error(`Invalid shared ${type} document: ${document_id}`);
		const updated = db
			.prepare('SELECT updated_at FROM documents WHERE document_id = ?')
			.get(document_id) as { updated_at: string | null } | undefined;
		if (updated?.updated_at !== input.expected_updated_at[document_id])
			throw new Error(
				`Shared ${type} changed since it was read. Read the page again before saving.`
			);
		return { document_id, type, ids: reachable(document_id, nodes) };
	});
	const excluded = new Set(shared.map((item) => item.document_id));
	const page_ids = reachable(input.document_id, nodes, excluded);
	const docs = [
		{ type: 'page', doc: extract(input.document_id, page_ids, nodes), ids: page_ids },
		...shared.map((item) => ({
			type: item.type,
			doc: extract(item.document_id, item.ids, nodes),
			ids: item.ids
		}))
	];
	const refs_before = new Set(
		(
			db.prepare('SELECT DISTINCT asset_id FROM asset_refs').all() as Array<{ asset_id: string }>
		).map((row) => row.asset_id)
	);
	with_transaction(() => {
		const now = new Date().toISOString();
		const upsert = db.prepare(
			'UPDATE documents SET data = ?, updated_at = ? WHERE document_id = ? AND type = ?'
		);
		const delete_refs = db.prepare('DELETE FROM document_refs WHERE source_document_id = ?');
		const insert_ref = db.prepare(
			'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
		);
		for (const item of docs) {
			upsert.run(JSON.stringify(item.doc), now, item.doc.document_id, item.type);
			delete_refs.run(item.doc.document_id);
			for (const [order, target] of document_refs(nodes, item.ids, item.doc.document_id).entries())
				insert_ref.run(target, item.doc.document_id, order);
			cleanup_translations(item.doc.document_id);
			rebuild_asset_refs(item.doc.document_id);
		}
	});
	await cleanup_assets(refs_before);
	void snapshot_if_stale();
	const slug_row = db
		.prepare('SELECT slug FROM document_slugs WHERE document_id = ? AND is_active = 1')
		.get(input.document_id) as { slug: string } | undefined;
	return {
		ok: true,
		document_id: input.document_id,
		page_href: slug_row ? `/${slug_row.slug}` : '/',
		title: extract_page_metadata(docs[0].doc).title
	};
}
