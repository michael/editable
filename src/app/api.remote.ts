import { rebuild_asset_refs } from './server_asset_refs.js';
import { translated_href } from './document_links.js';
import { select_language } from './languages.js';
import { getRequestEvent, query, command } from '$app/server';
import {
	cleanup_translations,
	languages,
	save_translated_document,
	translated_document
} from './server_translations.js';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import slugify from 'slugify';
import crypto from 'node:crypto';
import { validate_document } from 'svedit';
import { db, with_transaction, delete_orphaned_assets, touch_asset } from '#app/services.js';

import { build_page_forest } from '#app/page_tree.js';
import type { SitemapEntry } from '#lib/server/sitemap.js';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { document_schema } from '#app/document_schema.js';
import { collect_node_ids_in_order } from '#lib/document_graph.js';
import { is_reserved_markdown_slug } from '#app/markdown/registry.js';
import {
	extract_page_metadata,
	extract_site_metadata,
	collect_page_body_node_ids
} from '#app/page_metadata.js';
import type { PreviewMediaNode } from '#app/page_metadata.js';
import type { Attachment, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
import type { StatementSync } from 'node:sqlite';
import {
	admin_session_cookie_name,
	get_required_admin_password,
	get_session_expires_at,
	delete_session,
	clear_admin_session_cookie,
	set_admin_session_cookie,
	require_admin_session,
	passwords_match,
	get_login_lockout_seconds,
	register_failed_login,
	reset_login_throttle
} from '#lib/server/auth.js';

const admin_login_input_schema = v.object({
	password: v.string()
});

function create_page_url_error_result(code: string, message: string) {
	return {
		ok: false,
		code,
		message
	};
}

function create_auth_error_result(code: string, message: string) {
	return {
		ok: false,
		code,
		message
	};
}

function format_lockout_duration(seconds: number): string {
	if (seconds < 60) return `${seconds} seconds`;
	const minutes = Math.ceil(seconds / 60);
	return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

type DocumentRow = {
	document_id: string;
	type: string;
	data: string;
	created_at: string | null | undefined;
	updated_at: string | null | undefined;
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
	created_at: string | null;
	updated_at: string | null;
};

export type InternalLinkPreview = {
	document_id: string;
	title: string;
	description: string | null;
	preview_media_node: PreviewMediaNode | null;
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
	created_at: string | null;
	updated_at: string | null;
	children: PageTreeNode[];
};

const save_document_input_schema = v.object({
	document_id: v.string(),
	nodes: v.record(v.string(), v.any()),
	create: v.optional(v.boolean()),
	language: v.optional(v.string())
});

const update_page_slug_input_schema = v.object({
	document_id: v.string(),
	slug: v.string()
});

const delete_page_input_schema = v.object({
	document_id: v.string()
});

function get_attached_ranges(
	value: { marks?: Attachment[]; annotations?: Attachment[] } | null | undefined
): Attachment[] {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

/**
 * Collect all node ids reachable from a root node by walking node/node_array
 * properties and mark/annotation references.
 */
function collect_node_ids(
	root_id: string,
	nodes: Record<string, DocumentNode>,
	exclude_roots?: Set<string>
): Set<string> {
	return new Set(collect_node_ids_in_order(root_id, nodes, document_schema, exclude_roots));
}

function get_referenced_asset_ids(): Set<string> {
	const rows = db.prepare('SELECT DISTINCT asset_id FROM asset_refs').all() as unknown as Array<{
		asset_id: string;
	}>;
	return new Set(rows.map((row) => row.asset_id));
}

/**
 * Remove asset files no longer referenced by any document. Runs after
 * successful writes; a cleanup failure must not fail the request.
 *
 * Assets that lost their last reference in the write (refs_before minus
 * refs_after) get their orphan clock started via touch_asset, so the grace
 * period runs from dereferencing — not from upload.
 * refs_before holds the referenced asset ids captured before the write.
 */
async function cleanup_orphaned_assets(refs_before: Set<string>) {
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
}

function extract_document(
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

function get_doc_from_db(document_id: string): DocumentData {
	const doc_row = db
		.prepare('SELECT * FROM documents WHERE document_id = ?')
		.get(document_id) as unknown as DocumentRow | undefined;

	if (!doc_row) {
		throw new Error(`Document not found: ${document_id}`);
	}

	return JSON.parse(doc_row.data);
}

function get_optional_doc_from_db(document_id: string): DocumentData | null {
	const doc_row = db
		.prepare('SELECT * FROM documents WHERE document_id = ?')
		.get(document_id) as unknown as DocumentRow | undefined;

	if (!doc_row) return null;
	return JSON.parse(doc_row.data);
}

function get_home_page_id_from_db(): string | null {
	const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get('home_page_id') as
		{ value: string } | undefined;

	return row?.value ?? null;
}

function is_home_page_document_id(document_id: string): boolean {
	return get_home_page_id_from_db() === document_id;
}

function get_active_slug_for_document_id(document_id: string): string | null {
	const row = db
		.prepare('SELECT slug FROM document_slugs WHERE document_id = ? AND is_active = 1')
		.get(document_id) as unknown as { slug: string } | undefined;

	return row?.slug ?? null;
}

function resolve_slug(
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

function create_slug_candidate(title: string, document_id: string): string {
	const slug = slugify(title, { lower: true, strict: true, trim: true });
	return slug || document_id;
}

function create_unique_slug(base_slug: string): string {
	const slug_exists_stmt = db.prepare('SELECT document_id FROM document_slugs WHERE slug = ?');

	let slug = base_slug;
	let suffix = 2;

	while (true) {
		const row = slug_exists_stmt.get(slug) as unknown as { document_id: string } | undefined;
		if (!row && !is_reserved_markdown_slug(slug)) return slug;
		slug = `${base_slug}-${suffix}`;
		suffix += 1;
	}
}

function parse_internal_page_href(href: string): { slug: string; fragment: string } | null {
	if (!href) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
	if (href.startsWith('//')) return null;
	if (!href.startsWith('/')) return null;

	const [path_part, fragment_part] = href.split('#');
	if (!path_part || path_part === '/') return null;

	const segments = path_part.split('/').filter(Boolean);
	if (segments.length !== 1) return null;

	const slug = segments[0];
	if (!slug) return null;

	return {
		slug,
		fragment: fragment_part ? `#${fragment_part}` : ''
	};
}

function normalize_internal_page_href(
	href: string,
	source_document_id: string | undefined
): string | null {
	const parsed = parse_internal_page_href(href);
	if (!parsed) return null;

	const resolved = resolve_slug(parsed.slug);
	if (!resolved) return null;
	if (source_document_id && resolved.document_id === source_document_id) return null;

	return resolved.document_id;
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
				if (!range_node || range_node.type !== 'link') continue;
				if (typeof range_node.href !== 'string') continue;

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

function update_document_refs(
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

function get_shared_root_ids(page_doc: DocumentData): {
	nav_root_id: string | null;
	footer_root_id: string | null;
} {
	const page_node = page_doc.nodes[page_doc.document_id];

	return {
		nav_root_id: typeof page_node?.nav === 'string' ? page_node.nav : null,
		footer_root_id: typeof page_node?.footer === 'string' ? page_node.footer : null
	};
}

function get_combined_document(document_id: string): DocumentData {
	const page_doc = get_doc_from_db(document_id);
	const page_node = page_doc.nodes[page_doc.document_id];
	const merged_nodes = { ...page_doc.nodes };

	if (page_node?.nav) {
		const nav_doc = get_doc_from_db(page_node.nav);
		Object.assign(merged_nodes, nav_doc.nodes);
	}

	if (page_node?.footer) {
		const footer_doc = get_doc_from_db(page_node.footer);
		Object.assign(merged_nodes, footer_doc.nodes);
	}

	return {
		document_id: page_doc.document_id,
		nodes: merged_nodes
	};
}

function summarize_page_document(page_doc: PageDocumentRecord): PageSummary {
	const metadata = extract_page_metadata({
		document_id: page_doc.document_id,
		nodes: page_doc.nodes
	});
	const active_slug = get_active_slug_for_document_id(page_doc.document_id);

	// By invariant, only the home page has no active slug row. All other pages
	// must have an active slug, so a missing slug here implies `/`.
	return {
		document_id: page_doc.document_id,
		title: metadata.title || 'Untitled page',
		description: metadata.description,
		preview_media_node: metadata.preview_media_node,
		page_href: active_slug ? `/${active_slug}` : '/',
		slug: active_slug ?? '',
		shadowed_by_markdown: active_slug ? is_reserved_markdown_slug(active_slug) : false,
		created_at: page_doc.created_at ?? null,
		updated_at: page_doc.updated_at ?? null
	};
}

function get_outgoing_refs(source_document_id: string): string[] {
	const rows = db
		.prepare(
			'SELECT target_document_id FROM document_refs WHERE source_document_id = ? ORDER BY ref_order, rowid'
		)
		.all(source_document_id) as unknown as Array<{ target_document_id: string }>;

	return rows.map((row) => row.target_document_id);
}

function build_page_browser_data(
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
	const { nav_root_id, footer_root_id } = home_page_doc
		? get_shared_root_ids(home_page_doc)
		: { nav_root_id: null, footer_root_id: null };

	const tree_refs_by_page_id = new Map<string, string[]>();
	for (const page_doc of page_docs) {
		const body_node_ids = collect_page_body_node_ids(page_doc);
		tree_refs_by_page_id.set(
			page_doc.document_id,
			collect_document_refs(page_doc.nodes, body_node_ids, page_doc.document_id)
		);
	}

	if (home_page_id && summaries_by_id.has(home_page_id)) {
		const nav_refs = nav_root_id ? get_outgoing_refs(nav_root_id) : [];
		const footer_refs = footer_root_id ? get_outgoing_refs(footer_root_id) : [];
		const home_body_refs = tree_refs_by_page_id.get(home_page_id) ?? [];

		tree_refs_by_page_id.set(home_page_id, [...nav_refs, ...home_body_refs, ...footer_refs]);
	}

	const referenced_page_ids = new Set([...tree_refs_by_page_id.values()].flat());

	const non_home_root_summaries = summaries
		.filter(
			(summary) =>
				summary.document_id !== home_page_id && !referenced_page_ids.has(summary.document_id)
		)
		.sort((a, b) => {
			const a_updated_at = a.updated_at ?? a.created_at ?? '';
			const b_updated_at = b.updated_at ?? b.created_at ?? '';

			if (a_updated_at !== b_updated_at) {
				return b_updated_at.localeCompare(a_updated_at);
			}

			return a.title.localeCompare(b.title);
		});

	const root_ids = home_only ? [] : non_home_root_summaries.map((summary) => summary.document_id);
	if (home_page_id && summaries_by_id.has(home_page_id)) root_ids.unshift(home_page_id);
	const page_forest = build_page_forest(root_ids, summaries_by_id, tree_refs_by_page_id);
	const home_root = page_forest.find((node) => node.document_id === home_page_id);
	if (home_root) home_root.title = 'Home';

	return {
		home_page_id,
		current_document_id,
		page_forest
	};
}

/**
 * Get a document from the database, stitching in shared documents (nav, footer).
 */
export const get_document = query(v.string(), async (slug) => {
	const resolved = resolve_slug(slug);

	if (!resolved) {
		error(404, `Page not found for slug: ${slug}`);
	}

	return {
		document: get_combined_document(resolved.document_id),
		slug: resolved.active_slug,
		redirect_to_slug: resolved.is_active ? null : resolved.active_slug
	};
});

/**
 * Get a page's own document for duplication, without the shared nav and footer
 * stitched in. The caller rebuilds those references against the current shared
 * documents, so returning them here would only invite copying them by mistake.
 */
export const get_page_document_for_duplicate = query(v.string(), async (slug) => {
	require_admin_session(getRequestEvent().locals);

	// The home page has no slug row by invariant, so it is addressed as `/` —
	// the same way the page browser and `page_href` refer to it.
	const document_id =
		slug === '/' ? get_home_page_id_from_db() : (resolve_slug(slug)?.document_id ?? null);

	if (!document_id) {
		error(404, `Page not found for slug: ${slug}`);
	}

	return {
		document: get_doc_from_db(document_id)
	};
});

/**
 * Resolve the configured home page and return its stitched document.
 */
export const get_home_document = query(v.void(), async () => {
	const home_page_id = get_home_page_id_from_db();

	if (!home_page_id) {
		throw new Error('Home page is not configured');
	}

	return {
		document: get_combined_document(home_page_id),
		slug: get_active_slug_for_document_id(home_page_id),
		redirect_to_slug: null
	};
});

/**
 * Derive site-level metadata (favicon) from the home page document.
 */
export const get_site_metadata = query(v.void(), async () => {
	const home_page_id = get_home_page_id_from_db();

	if (!home_page_id) {
		return { favicon: null };
	}

	return extract_site_metadata(get_doc_from_db(home_page_id));
});

/**
 * Return the current shared nav and footer documents used for composing new pages.
 */
export const get_shared_documents = query(v.void(), async () => {
	const home_page_id = get_home_page_id_from_db();

	if (!home_page_id) {
		throw new Error('Home page is not configured');
	}

	const home_page_doc = get_doc_from_db(home_page_id);
	const { nav_root_id, footer_root_id } = get_shared_root_ids(home_page_doc);

	if (!nav_root_id) {
		throw new Error('Home page nav document is not configured');
	}

	if (!footer_root_id) {
		throw new Error('Home page footer document is not configured');
	}

	return {
		nav_document: get_doc_from_db(nav_root_id),
		footer_document: get_doc_from_db(footer_root_id)
	};
});

/**
 * Return page browser data for the pages drawer.
 */
export const get_auth_status = query(v.void(), async () => {
	const { locals } = getRequestEvent();

	return {
		is_admin: !!locals.is_admin
	};
});

export const login_admin = command(admin_login_input_schema, async ({ password }) => {
	const { cookies } = getRequestEvent();
	const admin_password = get_required_admin_password();

	const lockout_seconds = get_login_lockout_seconds(db);
	if (lockout_seconds > 0) {
		return create_auth_error_result(
			'too_many_attempts',
			`Too many attempts. Try again in ${format_lockout_duration(lockout_seconds)}.`
		);
	}

	if (!passwords_match(password, admin_password)) {
		register_failed_login(db);
		return create_auth_error_result('invalid_password', 'Incorrect admin password.');
	}

	reset_login_throttle(db);

	const session_id = crypto.randomUUID();
	db.prepare('INSERT INTO sessions (session_id, expires) VALUES (?, ?)').run(
		session_id,
		get_session_expires_at()
	);
	set_admin_session_cookie(cookies, session_id);

	return {
		ok: true
	};
});

export const logout_admin = command(v.void(), async () => {
	const { cookies } = getRequestEvent();
	const session_id = cookies.get(admin_session_cookie_name);

	if (session_id) {
		await delete_session(session_id, db);
	}

	clear_admin_session_cookie(cookies);

	return {
		ok: true
	};
});

/**
 * Return page browser data for the pages drawer.
 */
export const get_page_browser_data = query(v.string(), async (href) => {
	const event = getRequestEvent();
	require_admin_session(event.locals);
	const url = new URL(href);
	const result = build_page_browser_data(url.pathname);
	const language = select_language(languages, url.searchParams.get('lang'));
	if (language && language !== languages[0] && url.pathname !== '/new') {
		const visit = (nodes: PageTreeNode[]) => {
			for (const node of nodes) {
				node.navigation_href = translated_href(node.page_href, language, url.origin);
				visit(node.children);
			}
		};
		visit(result.page_forest);
	}
	return result;
});

/** Return public URLs and saved timestamps for pages reachable from Home. */
export const get_sitemap_entries = query(async () => {
	const { page_forest } = build_page_browser_data('/', true);
	const entries: SitemapEntry[] = [];
	const queue = [...page_forest];
	for (const page of queue) {
		if (page.shadowed_by_markdown) continue;
		entries.push({ path: page.page_href, lastmod: page.updated_at ?? page.created_at });
		queue.push(...page.children);
	}
	return entries;
});

/**
 * Delete a page document and its related refs.
 */
export const delete_page = command(delete_page_input_schema, async ({ document_id }) => {
	require_admin_session(getRequestEvent().locals);

	const home_page_id = get_home_page_id_from_db();

	if (!document_id) {
		error(400, 'Document id is required');
	}

	if (document_id === home_page_id) {
		error(400, 'The home page cannot be deleted');
	}

	const existing_doc = get_optional_doc_from_db(document_id);
	if (!existing_doc) {
		error(404, `Document not found: ${document_id}`);
	}

	const delete_document = db.prepare('DELETE FROM documents WHERE document_id = ? AND type = ?');
	const delete_asset_refs = db.prepare('DELETE FROM asset_refs WHERE document_id = ?');
	const delete_outgoing_document_refs = db.prepare(
		'DELETE FROM document_refs WHERE source_document_id = ?'
	);
	const delete_incoming_document_refs = db.prepare(
		'DELETE FROM document_refs WHERE target_document_id = ?'
	);
	const delete_document_slugs = db.prepare('DELETE FROM document_slugs WHERE document_id = ?');

	const refs_before = get_referenced_asset_ids();

	with_transaction(() => {
		delete_asset_refs.run(document_id);
		delete_outgoing_document_refs.run(document_id);
		delete_incoming_document_refs.run(document_id);
		delete_document_slugs.run(document_id);
		delete_document.run(document_id, 'page');
		cleanup_translations(document_id);
	});

	await cleanup_orphaned_assets(refs_before);

	return {
		ok: true,
		document_id
	};
});

/**
 * Return a lightweight preview for a simple internal page href like `/some-slug`.
 */
export const get_internal_link_preview = query(v.string(), async (href) => {
	const parsed = parse_internal_page_href(href);
	if (!parsed) {
		return null;
	}

	const resolved = resolve_slug(parsed.slug);
	if (!resolved) {
		return null;
	}

	const doc_row = db
		.prepare('SELECT type, data FROM documents WHERE document_id = ?')
		.get(resolved.document_id) as unknown as DocumentRow | undefined;
	if (!doc_row || doc_row.type !== 'page') {
		return null;
	}

	const page_doc = JSON.parse(doc_row.data) as DocumentData;
	const metadata = extract_page_metadata(page_doc);

	const preview: InternalLinkPreview = {
		document_id: resolved.document_id,
		title: metadata.title || 'Untitled page',
		description: metadata.description,
		preview_media_node: metadata.preview_media_node
	};
	return preview;
});

/**
 * Save a document to the database, splitting shared documents (nav, footer) back out.
 */
function rewrite_internal_page_href(href: string, target_document_id: string, new_slug: string) {
	const parsed = parse_internal_page_href(href);
	if (!parsed) return href;

	const resolved = resolve_slug(parsed.slug);
	if (resolved?.document_id !== target_document_id) return href;

	return `/${new_slug}${parsed.fragment}`;
}

function rewrite_internal_page_hrefs(
	nodes: Record<string, DocumentNode>,
	target_document_id: string,
	new_slug: string
) {
	for (const node of Object.values(nodes)) {
		if (!node || typeof node !== 'object') continue;

		if (typeof node.href === 'string') {
			node.href = rewrite_internal_page_href(node.href, target_document_id, new_slug);
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
				if (!range_node || range_node.type !== 'link') continue;
				if (typeof range_node.href !== 'string') continue;

				range_node.href = rewrite_internal_page_href(range_node.href, target_document_id, new_slug);
			}
		}
	}
}

function insert_active_slug(
	document_id: string,
	slug: string,
	insert_slug_stmt: StatementSync,
	deactivate_slug_stmt: StatementSync
) {
	deactivate_slug_stmt.run(document_id);
	insert_slug_stmt.run(slug, document_id, 1, new Date().toISOString());
}

function move_active_slug_to_history(
	document_id: string,
	insert_slug_stmt: StatementSync,
	deactivate_slug_stmt: StatementSync,
	delete_slug_stmt: StatementSync
) {
	const current_slug = get_active_slug_for_document_id(document_id);
	if (!current_slug) return null;

	delete_slug_stmt.run(current_slug);
	insert_slug_stmt.run(current_slug, document_id, 0, new Date().toISOString());
	deactivate_slug_stmt.run(document_id);
	return current_slug;
}

function assign_active_slug(
	document_id: string,
	slug: string,
	insert_slug_stmt: StatementSync,
	deactivate_slug_stmt: StatementSync,
	delete_slug_stmt: StatementSync
) {
	delete_slug_stmt.run(slug);
	insert_active_slug(document_id, slug, insert_slug_stmt, deactivate_slug_stmt);
}

export const get_translated_document = query(
	v.object({ document_id: v.string(), language: v.string() }),
	async (input) => {
		return translated_document(input.document_id, input.language);
	}
);

export const save_translations = command(
	v.object({
		document_id: v.string(),
		nodes: v.record(v.string(), v.any()),
		language: v.string(),
		translation_revision: v.string()
	}),
	async (input) => {
		require_admin_session(getRequestEvent().locals);
		const refs_before = get_referenced_asset_ids();
		const result = save_translated_document(input);
		await cleanup_orphaned_assets(refs_before);
		void snapshot_if_stale();
		return result;
	}
);

export const save_document = command(save_document_input_schema, async (combined_doc) => {
	require_admin_session(getRequestEvent().locals);
	if (combined_doc.language && combined_doc.language !== languages[0])
		error(400, 'Use the translation save command for additional languages.');

	const all_nodes = structuredClone(combined_doc.nodes);
	const page_node = all_nodes[combined_doc.document_id];

	if (page_node?.type !== 'page') {
		error(400, `Root node must be a page: ${combined_doc.document_id}`);
	}

	// Enforce document invariants at the write boundary — a malformed graph
	// must never be persisted, since it would break rendering for visitors.
	try {
		validate_document({ document_id: combined_doc.document_id, nodes: all_nodes }, document_schema);
	} catch (err) {
		error(400, `Invalid document: ${err instanceof Error ? err.message : String(err)}`);
	}

	if (combined_doc.create) {
		const existing_doc = get_optional_doc_from_db(combined_doc.document_id);
		if (existing_doc) {
			error(409, `Document already exists: ${combined_doc.document_id}`);
		}
	}

	const nav_root_id = page_node.nav;
	const footer_root_id = page_node.footer;

	const nav_node_ids = nav_root_id
		? new Set(collect_node_ids_in_order(nav_root_id, all_nodes, document_schema))
		: new Set<string>();
	const footer_node_ids = footer_root_id
		? new Set(collect_node_ids_in_order(footer_root_id, all_nodes, document_schema))
		: new Set<string>();

	const exclude_roots = new Set<string>();
	if (nav_root_id) exclude_roots.add(nav_root_id);
	if (footer_root_id) exclude_roots.add(footer_root_id);

	const page_node_ids = collect_node_ids(combined_doc.document_id, all_nodes, exclude_roots);
	const page_doc = extract_document(combined_doc.document_id, page_node_ids, all_nodes);

	const upsert = db.prepare(
		'INSERT INTO documents (document_id, type, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
	);

	const delete_document_refs = db.prepare('DELETE FROM document_refs WHERE source_document_id = ?');
	const insert_document_ref = db.prepare(
		'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
	);

	const deactivate_active_slug = db.prepare(
		'UPDATE document_slugs SET is_active = 0 WHERE document_id = ? AND is_active = 1'
	);
	const insert_slug = db.prepare(
		'INSERT INTO document_slugs (slug, document_id, is_active, created_at) VALUES (?, ?, ?, ?)'
	);

	const refs_before = get_referenced_asset_ids();

	with_transaction(() => {
		const existing_page_row = db
			.prepare('SELECT created_at FROM documents WHERE document_id = ?')
			.get(combined_doc.document_id) as unknown as DocumentRow | undefined;
		const now_iso = new Date().toISOString();
		const created_at = existing_page_row?.created_at ?? now_iso;

		upsert.run(combined_doc.document_id, 'page', JSON.stringify(page_doc), created_at, now_iso);
		update_document_refs(
			combined_doc.document_id,
			collect_document_refs(all_nodes, page_node_ids, combined_doc.document_id),
			delete_document_refs,
			insert_document_ref
		);

		if (nav_root_id && nav_node_ids.size > 0) {
			const nav_doc = extract_document(nav_root_id, nav_node_ids, all_nodes);
			const existing_nav_row = db
				.prepare('SELECT created_at FROM documents WHERE document_id = ?')
				.get(nav_root_id) as unknown as DocumentRow | undefined;
			const nav_created_at = existing_nav_row?.created_at ?? now_iso;
			upsert.run(nav_root_id, 'nav', JSON.stringify(nav_doc), nav_created_at, now_iso);
			update_document_refs(
				nav_root_id,
				collect_document_refs(all_nodes, nav_node_ids, nav_root_id),
				delete_document_refs,
				insert_document_ref
			);
		}

		if (footer_root_id && footer_node_ids.size > 0) {
			const footer_doc = extract_document(footer_root_id, footer_node_ids, all_nodes);
			const existing_footer_row = db
				.prepare('SELECT created_at FROM documents WHERE document_id = ?')
				.get(footer_root_id) as unknown as DocumentRow | undefined;
			const footer_created_at = existing_footer_row?.created_at ?? now_iso;
			upsert.run(footer_root_id, 'footer', JSON.stringify(footer_doc), footer_created_at, now_iso);
			update_document_refs(
				footer_root_id,
				collect_document_refs(all_nodes, footer_node_ids, footer_root_id),
				delete_document_refs,
				insert_document_ref
			);
		}

		for (const id of [combined_doc.document_id, nav_root_id, footer_root_id]) {
			if (id) {
				cleanup_translations(id);
				rebuild_asset_refs(id);
			}
		}

		let active_slug = get_active_slug_for_document_id(combined_doc.document_id);

		if (
			combined_doc.create &&
			!active_slug &&
			!is_home_page_document_id(combined_doc.document_id)
		) {
			const metadata = extract_page_metadata(page_doc);
			const base_slug = create_slug_candidate(
				metadata.title || 'Untitled page',
				combined_doc.document_id
			);
			active_slug = create_unique_slug(base_slug);
			insert_active_slug(
				combined_doc.document_id,
				active_slug,
				insert_slug,
				deactivate_active_slug
			);
		}

		const persisted_page = get_optional_doc_from_db(combined_doc.document_id);
		if (!persisted_page) {
			throw new Error(`Failed to persist page document: ${combined_doc.document_id}`);
		}
	});

	await cleanup_orphaned_assets(refs_before);

	// Fire-and-forget: write-driven trigger for the daily full-database
	// safety snapshot (never throws, never blocks the save).
	void snapshot_if_stale();

	return {
		ok: true,
		document_id: combined_doc.document_id,
		slug: is_home_page_document_id(combined_doc.document_id)
			? null
			: get_active_slug_for_document_id(combined_doc.document_id),
		created: !!combined_doc.create
	};
});

export const update_page_slug = command(update_page_slug_input_schema, async (input) => {
	require_admin_session(getRequestEvent().locals);

	const normalized_slug = slugify(input.slug, { lower: true, strict: true, trim: true });

	if (!normalized_slug) {
		return create_page_url_error_result('page_url_empty', 'Page URL cannot be empty');
	}

	if (is_reserved_markdown_slug(normalized_slug)) {
		return create_page_url_error_result(
			'page_url_reserved',
			'That Page URL is reserved by a markdown page and cannot be used.'
		);
	}

	const existing_doc = get_optional_doc_from_db(input.document_id);
	if (!existing_doc) {
		return create_page_url_error_result(
			'page_not_found',
			`Document not found: ${input.document_id}`
		);
	}

	const home_page_id = get_home_page_id_from_db();
	if (home_page_id === input.document_id) {
		return create_page_url_error_result(
			'home_page_url_locked',
			'The home page URL cannot be changed'
		);
	}

	const current_active_slug = get_active_slug_for_document_id(input.document_id);
	if (!current_active_slug) {
		return create_page_url_error_result(
			'active_slug_missing',
			`Active slug not found for document: ${input.document_id}`
		);
	}

	if (normalized_slug === current_active_slug) {
		return {
			ok: true,
			slug: current_active_slug
		};
	}

	const existing_slug = db
		.prepare('SELECT document_id, is_active FROM document_slugs WHERE slug = ?')
		.get(normalized_slug) as unknown as { document_id: string; is_active: number } | undefined;

	if (
		existing_slug &&
		existing_slug.document_id !== input.document_id &&
		existing_slug.is_active === 1
	) {
		return create_page_url_error_result(
			'page_url_used_by_other_page',
			'That Page URL is already in use by another page. Rename that page first.'
		);
	}

	const delete_slug = db.prepare('DELETE FROM document_slugs WHERE slug = ?');
	const deactivate_active_slug = db.prepare(
		'UPDATE document_slugs SET is_active = 0 WHERE document_id = ? AND is_active = 1'
	);
	const insert_slug = db.prepare(
		'INSERT INTO document_slugs (slug, document_id, is_active, created_at) VALUES (?, ?, ?, ?)'
	);

	const new_active_slug = with_transaction(() => {
		move_active_slug_to_history(
			input.document_id,
			insert_slug,
			deactivate_active_slug,
			delete_slug
		);
		assign_active_slug(
			input.document_id,
			normalized_slug,
			insert_slug,
			deactivate_active_slug,
			delete_slug
		);

		const active_slug = get_active_slug_for_document_id(input.document_id);
		if (!active_slug) {
			throw new Error('Failed to assign new active slug');
		}

		const page_rows = db
			.prepare('SELECT * FROM documents WHERE type IN (?, ?, ?) ORDER BY document_id')
			.all('page', 'nav', 'footer') as unknown as DocumentRow[];

		const upsert = db.prepare(
			'INSERT INTO documents (document_id, type, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
		);
		const delete_document_refs = db.prepare(
			'DELETE FROM document_refs WHERE source_document_id = ?'
		);
		const insert_document_ref = db.prepare(
			'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
		);

		const now_iso = new Date().toISOString();

		for (const row of page_rows) {
			const doc = JSON.parse(row.data);
			rewrite_internal_page_hrefs(doc.nodes, input.document_id, active_slug);
			upsert.run(
				row.document_id,
				row.type,
				JSON.stringify(doc),
				row.created_at ?? now_iso,
				now_iso
			);

			const root_id = row.document_id;
			const node_ids = collect_node_ids(root_id, doc.nodes);
			update_document_refs(
				root_id,
				collect_document_refs(doc.nodes, node_ids, root_id),
				delete_document_refs,
				insert_document_ref
			);
		}

		if (languages.length) {
			const translations = db.prepare('SELECT rowid, value FROM translations').all() as {
				rowid: number;
				value: string;
			}[];
			for (const row of translations) {
				const payload = JSON.parse(row.value);
				rewrite_internal_page_hrefs(payload.nodes, input.document_id, active_slug);
				const value = JSON.stringify(payload);
				if (value !== row.value)
					db.prepare('UPDATE translations SET value = ?, updated_at = ? WHERE rowid = ?').run(
						value,
						now_iso,
						row.rowid
					);
			}
		}
		return active_slug;
	});

	return {
		ok: true,
		document_id: input.document_id,
		page_href: `/${new_active_slug}`
	};
});
