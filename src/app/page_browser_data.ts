import type { DocumentNode } from 'svedit';
import { backend } from '#app/services.js';
import {
	get_home_page_id_from_db,
	resolve_slug,
	shared_document_types
} from '#app/server_documents.js';
import { is_reserved_language_slug } from '#app/languages.js';
import { site } from '#app/server_site.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';
import { extract_page_metadata } from '#app/page_metadata.js';
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

async function list_page_documents(): Promise<PageDocumentRecord[]> {
	return (await backend.list_documents('page')).map((record) => ({
		document_id: record.document_id,
		nodes: record.data.nodes,
		created_at: record.created_at ?? null,
		updated_at: record.updated_at ?? null
	}));
}

function summarize_page_document(
	page_doc: PageDocumentRecord,
	active_slug: string | null
): PageSummary {
	const metadata = extract_page_metadata({
		document_id: page_doc.document_id,
		nodes: page_doc.nodes
	});
	return {
		document_id: page_doc.document_id,
		title: metadata.title || 'Untitled page',
		description: metadata.description,
		preview_media_node: metadata.preview_media_node,
		page_href: active_slug ? `/${active_slug}` : '/',
		slug: active_slug ?? '',
		shadowed_by_markdown: active_slug ? is_reserved_markdown_slug(active_slug) : false,
		shadowed_by_language: active_slug
			? is_reserved_language_slug(active_slug, site.languages)
			: false,
		created_at: page_doc.created_at ?? null,
		updated_at: page_doc.updated_at ?? null
	};
}

/** Build the same page tree used by the Pages drawer. */
export async function build_page_browser_data(
	pathname: string,
	home_only = false
): Promise<{
	home_page_id: string | null;
	current_document_id: string | null;
	page_forest: PageTreeNode[];
}> {
	const home_page_id = await get_home_page_id_from_db();
	const current_document_id =
		pathname === '/'
			? home_page_id
			: ((await resolve_slug(pathname.slice(1)))?.document_id ?? null);
	const page_docs = await list_page_documents();
	const page_docs_by_id = new Map(page_docs.map((page_doc) => [page_doc.document_id, page_doc]));
	const active_slugs = new Map(
		(await backend.list_slugs())
			.filter((record) => record.is_active)
			.map((record) => [record.document_id, record.slug])
	);
	const summaries = page_docs.map((page_doc) =>
		summarize_page_document(page_doc, active_slugs.get(page_doc.document_id) ?? null)
	);
	const summaries_by_id = new Map(summaries.map((summary) => [summary.document_id, summary]));
	// What every document links to, as recorded on its last save.
	const refs_by_document_id = new Map(
		(await backend.list_document_refs()).map((refs) => [refs.document_id, refs.target_ids])
	);
	const refs_by_page_id = new Map(
		page_docs.map((page_doc) => [
			page_doc.document_id,
			refs_by_document_id.get(page_doc.document_id) ?? []
		])
	);
	// The home page also lists what the shared documents link to: banner and nav before its body, footer after.
	const home_page_doc = home_page_id ? page_docs_by_id.get(home_page_id) : undefined;
	if (home_page_doc) {
		const [banner_refs, nav_refs, footer_refs] = shared_document_types.map((type) => {
			const shared_id = home_page_doc.nodes[home_page_doc.document_id]?.[type];
			return typeof shared_id === 'string' ? (refs_by_document_id.get(shared_id) ?? []) : [];
		});
		const home_body_refs = refs_by_page_id.get(home_page_doc.document_id) ?? [];
		refs_by_page_id.set(home_page_doc.document_id, [
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
