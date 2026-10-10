import type { TranslationMap } from './translations.js';
import { translation_payloads } from '../lib/asset_references.js';
import { languages, request_language } from './server_languages.js';
import { translated_href, parse_internal_page_href } from './document_links.js';
import { language_path, language_href, is_reserved_language_slug } from './languages.js';
import { getRequestEvent, query, command } from '$app/server';
import {
	cleanup_translations,
	save_translated_document,
	translated_document
} from './server_translations.js';
import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import slugify from 'slugify';
import crypto from 'node:crypto';
import { db, with_transaction } from '#app/services.js';
import {
	type DocumentData,
	type DocumentRow,
	InvalidDocumentError,
	collect_document_refs,
	collect_node_ids,
	get_active_slug_for_document_id,
	get_attached_ranges,
	get_combined_document,
	get_doc_from_db,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	get_shared_root_ids,
	is_home_page_document_id,
	persist_combined_page,
	resolve_slug,
	update_document_refs,
	with_asset_cleanup
} from '#app/server_documents.js';

import { build_page_browser_data } from '#app/page_browser_data.js';
import type { PageTreeNode } from '#app/page_browser_data.js';
export type { PageSummary, PageTreeNode } from '#app/page_browser_data.js';
import type { SitemapEntry } from '#lib/server/sitemap.js';
import { latest_modified } from '#lib/server/sitemap.js';
import { language_alternates } from './seo.js';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { document_schema } from '#app/document_schema.js';
import { is_reserved_markdown_slug, get_markdown_page_pathnames } from '#app/markdown/registry.js';
import { extract_page_metadata, extract_site_metadata } from '#app/page_metadata.js';
import type { PreviewMediaNode } from '#app/page_metadata.js';
import type { DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
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

export type InternalLinkPreview = {
	document_id: string;
	title: string;
	description: string | null;
	preview_media_node: PreviewMediaNode | null;
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
		if (!row && !is_reserved_markdown_slug(slug) && !is_reserved_language_slug(slug, languages))
			return slug;
		slug = `${base_slug}-${suffix}`;
		suffix += 1;
	}
}

/**
 * Get a document from the database, stitching in shared documents (banner, nav, footer).
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
	const { banner_root_id, nav_root_id, footer_root_id } = get_shared_root_ids(home_page_doc);

	if (!banner_root_id) {
		throw new Error('Home page banner document is not configured');
	}

	if (!nav_root_id) {
		throw new Error('Home page nav document is not configured');
	}

	if (!footer_root_id) {
		throw new Error('Home page footer document is not configured');
	}

	return {
		banner_document: get_doc_from_db(banner_root_id),
		nav_document: get_doc_from_db(nav_root_id),
		footer_document: get_doc_from_db(footer_root_id)
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
	const result = build_page_browser_data(language_path(url.pathname, languages).pathname);
	const language = request_language(url);
	if (language && language !== languages[0] && url.pathname !== '/new') {
		const visit = (nodes: PageTreeNode[]) => {
			for (const node of nodes) {
				node.navigation_href = translated_href(node.page_href, language, url.origin, languages);
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
	const records = db
		.prepare(
			`SELECT document_id, COALESCE(updated_at, created_at) AS modified,
		 json_extract(data, '$.nodes."' || document_id || '".banner') AS banner,
		 json_extract(data, '$.nodes."' || document_id || '".nav') AS nav,
		 json_extract(data, '$.nodes."' || document_id || '".footer') AS footer
		 FROM documents WHERE type IN ('page', 'banner', 'nav', 'footer')`
		)
		.all() as {
		document_id: string;
		modified: string | null;
		banner: string | null;
		nav: string | null;
		footer: string | null;
	}[];
	const records_by_id = new Map(records.map((record) => [record.document_id, record]));
	const translations = db
		.prepare('SELECT document_id, language, updated_at FROM translations')
		.all() as { document_id: string; language: string; updated_at: string }[];
	const modified_by_language = new Map(
		translations.map((row) => [JSON.stringify([row.document_id, row.language]), row.updated_at])
	);
	const entries: SitemapEntry[] = [];
	const queue = [...page_forest];
	for (const page of queue) {
		queue.push(...page.children);
		if (page.shadowed_by_markdown || page.shadowed_by_language) continue;
		const record = records_by_id.get(page.document_id);
		const ids = [page.document_id, record?.banner, record?.nav, record?.footer].filter(
			(id): id is string => !!id
		);
		const original_dates = ids.map((id) => records_by_id.get(id)?.modified);
		const alternates = language_alternates(page.page_href, languages);
		for (const language of languages.length ? languages : ['']) {
			entries.push({
				path: language ? language_href(page.page_href, language, languages) : page.page_href,
				lastmod: latest_modified([
					...original_dates,
					...ids.map((id) => modified_by_language.get(JSON.stringify([id, language])))
				]),
				alternates
			});
		}
	}
	for (const path of get_markdown_page_pathnames()) {
		if (!is_reserved_language_slug(path.slice(1), languages)) entries.push({ path, lastmod: null });
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

	await with_asset_cleanup(() =>
		with_transaction(() => {
			delete_asset_refs.run(document_id);
			delete_outgoing_document_refs.run(document_id);
			delete_incoming_document_refs.run(document_id);
			delete_document_slugs.run(document_id);
			delete_document.run(document_id, 'page');
			cleanup_translations(document_id);
		})
	);

	return {
		ok: true,
		document_id
	};
});

/**
 * Return a lightweight preview for a simple internal page href like `/some-slug`.
 */
export const get_internal_link_preview = query(v.string(), async (href) => {
	const parsed = parse_internal_page_href(href, languages);
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
function rewrite_internal_page_href(
	href: string,
	target_document_id: string,
	new_slug: string,
	link_languages: string[]
) {
	const parsed = parse_internal_page_href(href, link_languages);
	if (!parsed) return href;

	const resolved = resolve_slug(parsed.slug);
	if (resolved?.document_id !== target_document_id) return href;

	return `${parsed.prefix}/${new_slug}${parsed.suffix}`;
}

function rewrite_internal_page_hrefs(
	nodes: Record<string, DocumentNode>,
	target_document_id: string,
	new_slug: string,
	link_languages = languages
) {
	for (const node of Object.values(nodes)) {
		if (!node || typeof node !== 'object') continue;

		if (typeof node.href === 'string') {
			node.href = rewrite_internal_page_href(
				node.href,
				target_document_id,
				new_slug,
				link_languages
			);
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

				range_node.href = rewrite_internal_page_href(
					range_node.href,
					target_document_id,
					new_slug,
					link_languages
				);
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
		const result = await with_asset_cleanup(() => save_translated_document(input));
		void snapshot_if_stale();
		return result;
	}
);

export const save_document = command(save_document_input_schema, async (combined_doc) => {
	require_admin_session(getRequestEvent().locals);
	if (combined_doc.language && combined_doc.language !== languages[0])
		error(400, 'Use the translation save command for additional languages.');

	if (combined_doc.create && get_optional_doc_from_db(combined_doc.document_id)) {
		error(409, `Document already exists: ${combined_doc.document_id}`);
	}

	const deactivate_active_slug = db.prepare(
		'UPDATE document_slugs SET is_active = 0 WHERE document_id = ? AND is_active = 1'
	);
	const insert_slug = db.prepare(
		'INSERT INTO document_slugs (slug, document_id, is_active, created_at) VALUES (?, ?, ?, ?)'
	);

	try {
		await persist_combined_page(
			combined_doc.document_id,
			structuredClone(combined_doc.nodes),
			(page_doc) => {
				if (
					!combined_doc.create ||
					get_active_slug_for_document_id(combined_doc.document_id) ||
					is_home_page_document_id(combined_doc.document_id)
				)
					return;
				const metadata = extract_page_metadata(page_doc);
				const base_slug = create_slug_candidate(
					metadata.title || 'Untitled page',
					combined_doc.document_id
				);
				insert_active_slug(
					combined_doc.document_id,
					create_unique_slug(base_slug),
					insert_slug,
					deactivate_active_slug
				);
			}
		);
	} catch (err) {
		if (err instanceof InvalidDocumentError) error(400, err.message);
		throw err;
	}

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

	if (is_reserved_language_slug(normalized_slug, languages)) {
		return create_page_url_error_result(
			'page_url_reserved',
			'That Page URL is reserved by a language homepage and cannot be used.'
		);
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
			.prepare('SELECT * FROM documents WHERE type IN (?, ?, ?, ?) ORDER BY document_id')
			.all('page', 'banner', 'nav', 'footer') as unknown as DocumentRow[];

		const upsert = db.prepare(
			'INSERT INTO documents (document_id, type, data, created_at, updated_at) VALUES(?, ?, ?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at'
		);
		const delete_document_refs = db.prepare(
			'DELETE FROM document_refs WHERE source_document_id = ?'
		);
		const insert_document_ref = db.prepare(
			'INSERT OR REPLACE INTO document_refs (target_document_id, source_document_id, ref_order) VALUES (?, ?, ?)'
		);

		const translations = db.prepare('SELECT rowid, language, value FROM translations').all() as {
			rowid: number;
			language: string;
			value: string;
		}[];
		const link_languages = [...new Set([...languages, ...translations.map((row) => row.language)])];

		const now_iso = new Date().toISOString();

		for (const row of page_rows) {
			const doc = JSON.parse(row.data);
			rewrite_internal_page_hrefs(doc.nodes, input.document_id, active_slug, link_languages);
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

		for (const row of translations) {
			const map: TranslationMap = JSON.parse(row.value);
			for (const payload of translation_payloads(map))
				rewrite_internal_page_hrefs(
					payload.nodes ?? {},
					input.document_id,
					active_slug,
					link_languages
				);
			const value = JSON.stringify(map);
			if (value !== row.value)
				db.prepare('UPDATE translations SET value = ?, updated_at = ? WHERE rowid = ?').run(
					value,
					now_iso,
					row.rowid
				);
		}
		return active_slug;
	});

	return {
		ok: true,
		document_id: input.document_id,
		page_href: `/${new_active_slug}`
	};
});
