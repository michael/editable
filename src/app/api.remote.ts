import type { TranslationMap } from './translations.js';
import { translation_payloads } from '../lib/asset_references.js';
import { site } from './server_site.js';
import {
	normalize_href,
	normalize_hrefs,
	parse_internal_page_href,
	resolve_hrefs
} from './document_links.js';
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
import { store, with_transaction } from '#app/services.js';
import { translation_key } from '#lib/server/store.js';
import {
	type DocumentData,
	InvalidDocumentError,
	VersionConflictError,
	create_page_slug,
	get_active_slug_for_document_id,
	get_attached_ranges,
	get_combined_document,
	get_doc_from_db,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	get_document_version,
	is_home_page_document_id,
	is_reserved_route_slug,
	persist_document,
	resolve_slug,
	shared_document_types,
	with_asset_cleanup
} from '#app/server_documents.js';

import { build_page_browser_data } from '#app/page_browser_data.js';
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
import { require_admin_session } from '#lib/server/auth.js';
import { get_admin_auth } from './server_admin_auth.js';
import { revoke_all_grants } from '#app/server_oauth.js';

// Whatever the login dialog sends; Editable's own dialog sends the password.
const admin_login_input_schema = v.record(v.string(), v.string());

function create_page_url_error_result(code: string, message: string) {
	return {
		ok: false,
		code,
		message
	};
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
	language: v.optional(v.string()),
	// The page version the editor loaded; omit with force to overwrite newer changes.
	expected_version: v.optional(v.string()),
	force: v.optional(v.boolean())
});

const update_page_slug_input_schema = v.object({
	document_id: v.string(),
	slug: v.string()
});

const delete_page_input_schema = v.object({
	document_id: v.string()
});

/** Documents reach the editor with their links resolved for the site, in the main language. */
function resolve_site_links(document: DocumentData): DocumentData {
	return resolve_hrefs(document, site);
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
		document: resolve_site_links(get_combined_document(resolved.document_id)),
		version: get_document_version(resolved.document_id),
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
		document: resolve_site_links(get_doc_from_db(document_id))
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
		document: resolve_site_links(get_combined_document(home_page_id)),
		version: get_document_version(home_page_id),
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
	if (!home_page_id) throw new Error('Home page is not configured');

	const home_page_node = get_doc_from_db(home_page_id).nodes[home_page_id];
	const [banner_document, nav_document, footer_document] = shared_document_types.map((type) => {
		const shared_id = home_page_node?.[type];
		if (typeof shared_id !== 'string')
			throw new Error(`Home page ${type} document is not configured`);
		return resolve_site_links(get_doc_from_db(shared_id));
	});
	return { banner_document, nav_document, footer_document };
});

export const login_admin = command(admin_login_input_schema, async (credentials) => {
	return get_admin_auth().log_in(getRequestEvent(), credentials);
});

export const logout_admin = command(v.void(), async () => {
	await get_admin_auth().log_out(getRequestEvent());
	// Logging out also ends every MCP connection the admin approved.
	revoke_all_grants();
	return { ok: true };
});

/**
 * Return page browser data for the pages drawer.
 */
export const get_page_browser_data = query(v.string(), async (href) => {
	const event = getRequestEvent();
	require_admin_session(event.locals);
	const pathname = normalize_href(new URL(href).pathname, site);
	return build_page_browser_data(language_path(pathname, site.languages).pathname);
});

/** Return public URLs and saved timestamps for pages reachable from Home. */
export const get_sitemap_entries = query(async () => {
	const { languages } = site;
	const { page_forest } = build_page_browser_data('/', true);
	const records = store.documents.all().map((record) => {
		const root = record.data.nodes[record.document_id];
		return {
			document_id: record.document_id,
			modified: record.updated_at ?? record.created_at ?? null,
			banner: (root?.banner as string | null) ?? null,
			nav: (root?.nav as string | null) ?? null,
			footer: (root?.footer as string | null) ?? null
		};
	});
	const records_by_id = new Map(records.map((record) => [record.document_id, record]));
	const translations = store.translations.all();
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

	await with_asset_cleanup(() =>
		with_transaction(() => {
			for (const record of store.slugs.all())
				if (record.document_id === document_id) store.slugs.delete(record.slug);
			if (existing_doc.nodes[document_id]?.type === 'page') store.documents.delete(document_id);
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
	const parsed = parse_internal_page_href(normalize_href(href, site), site.languages);
	if (!parsed) {
		return null;
	}

	const resolved = resolve_slug(parsed.slug);
	if (!resolved) {
		return null;
	}

	const record = store.documents.get(resolved.document_id);
	if (!record || record.type !== 'page') {
		return null;
	}

	const metadata = extract_page_metadata(record.data);

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
	link_languages = site.languages
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

/** Make a slug the page's active one; its previous active slug stays as a redirect. */
function assign_active_slug(document_id: string, slug: string) {
	const created_at = new Date().toISOString();
	for (const record of store.slugs.all())
		if (record.document_id === document_id && record.is_active)
			store.slugs.put(record.slug, { ...record, is_active: false });
	store.slugs.put(slug, { slug, document_id, is_active: true, created_at });
}

export const get_translated_document = query(
	v.object({ document_id: v.string(), language: v.string() }),
	async (input) => {
		const result = translated_document(input.document_id, input.language);
		return { ...result, document: resolve_hrefs(result.document, site, result.language) };
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
	if (combined_doc.language && combined_doc.language !== site.languages[0])
		error(400, 'Use the translation save command for additional languages.');

	if (combined_doc.create && get_optional_doc_from_db(combined_doc.document_id)) {
		error(409, `Document already exists: ${combined_doc.document_id}`);
	}

	// Links come back resolved for the site; stored links never include the base.
	const baseline = get_optional_doc_from_db(combined_doc.document_id)
		? get_combined_document(combined_doc.document_id)
		: { document_id: combined_doc.document_id, nodes: {} };
	const { nodes } = normalize_hrefs(
		{ document_id: combined_doc.document_id, nodes: structuredClone(combined_doc.nodes) },
		baseline,
		site
	);

	let version: string;
	try {
		({ version } = await persist_document(combined_doc.document_id, nodes, {
			expected_version:
				combined_doc.create || combined_doc.force ? undefined : combined_doc.expected_version,
			on_write: (page_doc) => {
				if (
					!combined_doc.create ||
					get_active_slug_for_document_id(combined_doc.document_id) ||
					is_home_page_document_id(combined_doc.document_id)
				)
					return;
				create_page_slug(
					combined_doc.document_id,
					extract_page_metadata(page_doc).title || 'Untitled page'
				);
			}
		}));
	} catch (err) {
		if (err instanceof InvalidDocumentError) error(400, err.message);
		if (err instanceof VersionConflictError) {
			return { ok: false as const, code: 'version_conflict' as const, message: err.message };
		}
		throw err;
	}

	return {
		ok: true as const,
		version,
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

	if (is_reserved_route_slug(normalized_slug)) {
		return create_page_url_error_result(
			'page_url_reserved',
			'That Page URL is reserved by Editable and cannot be used.'
		);
	}

	if (is_reserved_language_slug(normalized_slug, site.languages)) {
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

	const existing_slug = store.slugs.get(normalized_slug);
	if (existing_slug && existing_slug.document_id !== input.document_id && existing_slug.is_active) {
		return create_page_url_error_result(
			'page_url_used_by_other_page',
			'That Page URL is already in use by another page. Rename that page first.'
		);
	}

	const new_active_slug = with_transaction(() => {
		assign_active_slug(input.document_id, normalized_slug);
		const active_slug = get_active_slug_for_document_id(input.document_id);
		if (!active_slug) {
			throw new Error('Failed to assign new active slug');
		}

		const translations = store.translations.all();
		const link_languages = [
			...new Set([...site.languages, ...translations.map((row) => row.language)])
		];

		// Rewritten links still point at the same page, so this is not a content
		// change and leaves updated_at alone.
		for (const record of store.documents.all()) {
			const doc = structuredClone(record.data);
			rewrite_internal_page_hrefs(doc.nodes, input.document_id, active_slug, link_languages);
			if (JSON.stringify(doc) === JSON.stringify(record.data)) continue;
			store.documents.put(record.document_id, { ...record, data: doc });
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
				store.translations.put(translation_key(row.document_id, row.language), { ...row, value });
		}
		return active_slug;
	});

	return {
		ok: true,
		document_id: input.document_id,
		page_href: `/${new_active_slug}`
	};
});
