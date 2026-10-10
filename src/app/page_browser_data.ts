import type { DocumentNode } from 'svedit';
import { db } from '#app/services.js';
import {
	type DocumentData,
	type DocumentRow,
	collect_document_refs,
	get_active_slug_for_document_id,
	get_home_page_id_from_db,
	get_shared_root_ids,
	resolve_slug
} from '#app/server_documents.js';
import { is_reserved_language_slug } from '#app/languages.js';
import { languages } from '#app/server_languages.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';
import { extract_page_metadata, collect_page_body_node_ids } from '#app/page_metadata.js';
import type { PreviewMediaNode } from '#app/page_metadata.js';
import { build_page_forest } from '#app/page_tree.js';

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
