import type { Attachment, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
import { db } from '#app/services.js';
import { document_schema } from '#app/document_schema.js';
import { is_reserved_language_slug } from '#app/languages.js';
import { languages } from '#app/server_languages.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';
import { extract_page_metadata, collect_page_body_node_ids } from '#app/page_metadata.js';
import type { PreviewMediaNode } from '#app/page_metadata.js';
import { build_page_forest } from '#app/page_tree.js';
import { parse_internal_page_href } from './document_links.js';

type DocumentRow = {
	document_id: string;
	type: string;
	data: string;
	created_at: string | null;
	updated_at: string | null;
};

type DocumentData = {
	document_id: string;
	nodes: Record<string, DocumentNode>;
};

type PageDocumentRecord = {
	document_id: string;
	nodes: Record<string, DocumentNode>;
	created_at: string | null;
	updated_at: string | null;
};

export type PageSummary = {
	document_id: string;
	title: string;
	description: string | null;
	preview_media_node: PreviewMediaNode | null;
	page_href: string;
	slug: string;
	shadowed_by_markdown: boolean;
	shadowed_by_language: boolean;
	created_at: string | null;
	updated_at: string | null;
};

export type PageTreeNode = {
	navigation_href?: string;
	document_id: string;
	title: string;
	description: string | null;
	preview_media_node: PreviewMediaNode | null;
	page_href: string;
	slug: string;
	shadowed_by_markdown: boolean;
	shadowed_by_language: boolean;
	created_at: string | null;
	updated_at: string | null;
	children: PageTreeNode[];
};

function get_home_page_id_from_db(): string | null {
	const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('home_page_id') as
		{ value: string } | undefined;
	return row?.value ?? null;
}

function get_active_slug_for_document_id(document_id: string): string | null {
	const row = db
		.prepare('SELECT slug FROM document_slugs WHERE document_id = ? AND is_active = 1')
		.get(document_id) as { slug: string } | undefined;
	return row?.slug ?? null;
}

function resolve_slug(slug: string): { document_id: string } | null {
	const row = db.prepare('SELECT document_id FROM document_slugs WHERE slug = ?').get(slug) as
		{ document_id: string } | undefined;
	return row ?? null;
}

function list_page_documents(): PageDocumentRecord[] {
	const rows = db
		.prepare('SELECT * FROM documents WHERE type = ? ORDER BY document_id')
		.all('page') as unknown as DocumentRow[];
	return rows.map((row) => {
		const doc = JSON.parse(row.data) as DocumentData;
		return {
			document_id: doc.document_id,
			nodes: doc.nodes,
			created_at: row.created_at ?? null,
			updated_at: row.updated_at ?? null
		};
	});
}

function normalize_internal_page_href(href: string, source_document_id: string): string | null {
	const parsed = parse_internal_page_href(href, languages);
	if (!parsed) return null;
	const resolved = resolve_slug(parsed.slug);
	if (!resolved || resolved.document_id === source_document_id) return null;
	return resolved.document_id;
}

function get_attached_ranges(value: { marks?: Attachment[]; annotations?: Attachment[] } | null) {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

function collect_document_refs(
	nodes: Record<string, DocumentNode>,
	node_ids: Iterable<string>,
	source_document_id: string
): string[] {
	const refs: string[] = [];
	const seen_refs = new Set<string>();
	for (const node_id of node_ids) {
		const node = nodes[node_id];
		if (!node) continue;
		if (typeof node.href === 'string') {
			const target_document_id = normalize_internal_page_href(node.href, source_document_id);
			if (target_document_id && !seen_refs.has(target_document_id)) {
				seen_refs.add(target_document_id);
				refs.push(target_document_id);
			}
		}
		const type_schema: NodeSchema | undefined = document_schema[node.type];
		if (!type_schema) continue;
		for (const [prop_name, prop_def] of Object.entries<PropertyDefinition>(
			type_schema.properties
		)) {
			if (prop_def.type !== 'text') continue;
			const value = node[prop_name];
			for (const range of get_attached_ranges(value)) {
				const range_node = range?.node_id ? nodes[range.node_id] : null;
				if (!range_node || range_node.type !== 'link' || typeof range_node.href !== 'string')
					continue;
				const target_document_id = normalize_internal_page_href(
					range_node.href,
					source_document_id
				);
				if (target_document_id && !seen_refs.has(target_document_id)) {
					seen_refs.add(target_document_id);
					refs.push(target_document_id);
				}
			}
		}
	}
	return refs;
}

function get_shared_root_ids(page_doc: DocumentData) {
	const page_node = page_doc.nodes[page_doc.document_id];
	return {
		banner_root_id: typeof page_node?.banner === 'string' ? page_node.banner : null,
		nav_root_id: typeof page_node?.nav === 'string' ? page_node.nav : null,
		footer_root_id: typeof page_node?.footer === 'string' ? page_node.footer : null
	};
}

function summarize_page_document(page_doc: PageDocumentRecord): PageSummary {
	const metadata = extract_page_metadata({
		document_id: page_doc.document_id,
		nodes: page_doc.nodes
	});
	const active_slug = get_active_slug_for_document_id(page_doc.document_id);
	return {
		document_id: page_doc.document_id,
		title: metadata.title || 'Untitled page',
		description: metadata.description,
		preview_media_node: metadata.preview_media_node,
		page_href: active_slug ? `/${active_slug}` : '/',
		slug: active_slug ?? '',
		shadowed_by_markdown: active_slug ? is_reserved_markdown_slug(active_slug) : false,
		shadowed_by_language: active_slug ? is_reserved_language_slug(active_slug, languages) : false,
		created_at: page_doc.created_at ?? null,
		updated_at: page_doc.updated_at ?? null
	};
}

function get_outgoing_refs(source_document_id: string): string[] {
	const rows = db
		.prepare(
			'SELECT target_document_id FROM document_refs WHERE source_document_id = ? ORDER BY ref_order, rowid'
		)
		.all(source_document_id) as Array<{ target_document_id: string }>;
	return rows.map((row) => row.target_document_id);
}

/** Build the same page tree used by the Pages drawer. */
export function build_page_browser_data(
	pathname: string,
	home_only = false
): {
	home_page_id: string | null;
	current_document_id: string | null;
	page_forest: PageTreeNode[];
} {
	const home_page_id = get_home_page_id_from_db();
	const current_document_id =
		pathname === '/' ? home_page_id : (resolve_slug(pathname.slice(1))?.document_id ?? null);
	const page_docs = list_page_documents();
	const page_docs_by_id = new Map(page_docs.map((page_doc) => [page_doc.document_id, page_doc]));
	const summaries = page_docs.map(summarize_page_document);
	const summaries_by_id = new Map(summaries.map((summary) => [summary.document_id, summary]));
	const home_page_doc = home_page_id ? (page_docs_by_id.get(home_page_id) ?? null) : null;
	const { banner_root_id, nav_root_id, footer_root_id } = home_page_doc
		? get_shared_root_ids(home_page_doc)
		: { banner_root_id: null, nav_root_id: null, footer_root_id: null };
	const refs_by_page_id = new Map<string, string[]>();
	for (const page_doc of page_docs) {
		const body_node_ids = collect_page_body_node_ids(page_doc);
		refs_by_page_id.set(
			page_doc.document_id,
			collect_document_refs(page_doc.nodes, body_node_ids, page_doc.document_id)
		);
	}
	if (home_page_id && summaries_by_id.has(home_page_id)) {
		const banner_refs = banner_root_id ? get_outgoing_refs(banner_root_id) : [];
		const nav_refs = nav_root_id ? get_outgoing_refs(nav_root_id) : [];
		const footer_refs = footer_root_id ? get_outgoing_refs(footer_root_id) : [];
		const home_body_refs = refs_by_page_id.get(home_page_id) ?? [];
		refs_by_page_id.set(home_page_id, [
			...banner_refs,
			...nav_refs,
			...home_body_refs,
			...footer_refs
		]);
	}
	const referenced_page_ids = new Set([...refs_by_page_id.values()].flat());
	const non_home_roots = summaries
		.filter(
			(summary) =>
				summary.document_id !== home_page_id && !referenced_page_ids.has(summary.document_id)
		)
		.sort((a, b) => {
			const a_updated_at = a.updated_at ?? a.created_at ?? '';
			const b_updated_at = b.updated_at ?? b.created_at ?? '';
			if (a_updated_at !== b_updated_at) return b_updated_at.localeCompare(a_updated_at);
			return a.title.localeCompare(b.title);
		});
	const root_ids = home_only ? [] : non_home_roots.map((summary) => summary.document_id);
	if (home_page_id && summaries_by_id.has(home_page_id)) root_ids.unshift(home_page_id);
	const page_forest = build_page_forest(root_ids, summaries_by_id, refs_by_page_id);
	const home_root = page_forest.find((node) => node.document_id === home_page_id);
	if (home_root) home_root.title = 'Home';
	return { home_page_id, current_document_id, page_forest };
}
