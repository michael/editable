import { isHttpError } from '@sveltejs/kit';
import {
	fill_node_defaults,
	type Attachment,
	type DocumentNode,
	type PropertyDefinition
} from 'svedit';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { edf_root_id, parse_edf, serialize_edf } from '#lib/edf.js';
import { languages } from './server_languages.js';
import { language_href, language_path } from './languages.js';
import { save_translated_document, translated_document } from './server_translations.js';
import { parse_internal_page_href } from './document_links.js';
import { MEDIA_DEFAULTS, document_schema } from './document_schema.js';
import nanoid from './nanoid.js';
import { extract_page_metadata } from './page_metadata.js';
import { stable_json } from './translations.js';
import { assert_uploaded_images } from './server_mcp_images.js';
import {
	type DocumentData,
	combine_page_document,
	create_page_slug,
	get_active_slug_for_document_id,
	get_doc_from_db,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	get_page_version,
	persist_combined_page,
	resolve_slug,
	shared_document_types,
	with_asset_cleanup
} from './server_documents.js';

/**
 * Resolve the ways agents refer to pages: a document id, a path, or a full URL
 * (whose host is ignored), including language prefixes and old slugs. The
 * language comes from the path prefix and defaults to the main language.
 */
function resolve_page(page: string): { document_id: string | null; language: string } {
	if (get_optional_doc_from_db(page)?.nodes[page]?.type === 'page')
		return { document_id: page, language: languages[0] ?? '' };

	let href = page.trim();
	if (/^https?:\/\//i.test(href)) href = URL.parse(href)?.pathname ?? '';
	const pathname = href.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
	const { language, pathname: unprefixed } = language_path(pathname, languages);
	if (unprefixed === '/') return { document_id: get_home_page_id_from_db(), language };

	const parsed = parse_internal_page_href(pathname, languages);
	return {
		document_id: parsed ? (resolve_slug(parsed.slug)?.document_id ?? null) : null,
		language
	};
}

/** The translation language to read or save, or null for the main language. */
function translation_language(language: string | undefined): string | null {
	if (!language || language === languages[0]) return null;
	if (languages.slice(1).includes(language)) return language;
	throw new Error(
		languages.length > 1
			? `Language ${language} is not enabled. Enabled languages: ${languages.join(', ')}.`
			: 'Translations are not enabled on this site.'
	);
}

/** The translation module reports problems as SvelteKit HTTP errors; agents need the message. */
function unwrap_http_error<T>(fn: () => T): T {
	try {
		return fn();
	} catch (err) {
		throw isHttpError(err) ? new Error(err.body.message, { cause: err }) : err;
	}
}

function page_href_for(document_id: string): string {
	const slug = get_active_slug_for_document_id(document_id);
	return slug ? `/${slug}` : '/';
}

const shared_ids_of = (page_node: DocumentNode) =>
	shared_document_types
		.map((type) => page_node[type])
		.filter((id): id is string => typeof id === 'string');

/**
 * Fill omitted properties and omitted marks/annotations, and order ranges by
 * position, so nodes compare equal however they were written.
 */
function normalize_node(node: DocumentNode): DocumentNode {
	const filled = fill_node_defaults(node, document_schema);
	const properties = document_schema[filled.type]?.properties ?? {};
	const by_position = (a: Attachment, b: Attachment) =>
		a.start_offset - b.start_offset || a.end_offset - b.end_offset;
	for (const [name, definition] of Object.entries<PropertyDefinition>(properties)) {
		const value = filled[name];
		if ((definition.type === 'text' || definition.type === 'node_array') && value) {
			filled[name] = {
				...value,
				marks: [...(value.marks ?? [])].sort(by_position),
				annotations: [...(value.annotations ?? [])].sort(by_position)
			};
		}
	}
	return filled;
}

export function read_mcp_page(page: string, requested_language?: string, include_shared = false) {
	const { document_id, language: path_language } = resolve_page(page);
	const page_doc = document_id && get_optional_doc_from_db(document_id);
	if (!document_id || !page_doc)
		throw new Error(
			`Page not found: ${page}. Use a path such as /about, a full URL, or a document_id from list_pages.`
		);

	const language = translation_language(requested_language ?? path_language);
	const translated =
		language && unwrap_http_error(() => translated_document(document_id, language));
	const document = translated ? translated.document : combine_page_document(page_doc);
	const edf = serialize_edf(document, document_schema, {
		exclude: include_shared ? [] : shared_ids_of(document.nodes[document_id])
	});
	return {
		page_href: language
			? language_href(page_href_for(document_id), language, languages)
			: page_href_for(document_id),
		language: language ?? languages[0] ?? null,
		languages,
		version: translated ? translated.translation_revision : get_page_version(document_id),
		edf
	};
}

/**
 * Parse a submitted page against the stored nodes. Unchanged nodes resolve to
 * the stored objects, so a save without edits writes nothing; changed and new
 * nodes are filled with defaults. The page keeps its shared references when
 * the submitted root leaves them out.
 */
function parse_submitted(edf: string, stored_nodes: Record<string, DocumentNode>) {
	const parsed = parse_edf(edf, document_schema, { stored: stored_nodes, generate_id: nanoid });
	const nodes: Record<string, DocumentNode> = {};
	const changed: string[] = [];
	for (const [id, node] of Object.entries(parsed.nodes)) {
		const normalized = normalize_node(node);
		const stored = stored_nodes[id];
		if (stored && stable_json(normalize_node(stored)) === stable_json(normalized)) {
			nodes[id] = stored;
		} else {
			nodes[id] = normalized;
			changed.push(id);
		}
	}
	const page_node = nodes[parsed.document_id];
	const stored_page = stored_nodes[parsed.document_id];
	if (page_node !== stored_page && stored_page)
		for (const type of shared_document_types) page_node[type] ??= stored_page[type];
	return { document_id: parsed.document_id, nodes, changed };
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
	edf: string;
	expected_version: string;
	language?: string;
}) {
	const language = translation_language(input.language);
	if (language) return save_mcp_translation({ ...input, language });

	const document_id = edf_root_id(input.edf);
	const current = get_optional_doc_from_db(document_id);
	if (current?.nodes[document_id]?.type !== 'page')
		throw new Error(
			`Existing page not found: ${document_id}. The root <page> id must be the document_id from read_page.`
		);
	// Check up front so a stale document is not reported as invalid.
	if (get_page_version(document_id) !== input.expected_version)
		throw new Error('Page changed since it was read. Read it again before saving.');

	// The submitted page replaces the stored one; shared documents that were
	// left out stay as stored, and stored nodes no longer reachable are dropped.
	const stored_nodes = combine_page_document(current).nodes;
	const { nodes: submitted, changed } = parse_submitted(input.edf, stored_nodes);
	const nodes = { ...stored_nodes, ...submitted };
	for (const type of shared_document_types) {
		if (nodes[document_id][type] !== current.nodes[document_id][type])
			throw new Error(`The shared ${type} reference cannot be changed through save_page.`);
	}
	assert_uploaded_images(changed.map((id) => nodes[id]));

	const { page_doc, version } = await persist_combined_page(document_id, nodes, {
		expected_version: input.expected_version
	});
	return page_result(document_id, page_doc, version);
}

/**
 * Translations are edits of the translated page. The translation module keeps
 * only text and media that differ from the main language and rejects
 * structural changes.
 */
async function save_mcp_translation(input: {
	edf: string;
	expected_version: string;
	language: string;
}) {
	const { language } = input;
	const document_id = edf_root_id(input.edf);
	const current = unwrap_http_error(() => translated_document(document_id, language));
	if (current.translation_revision !== input.expected_version)
		throw new Error(
			'The page or its translation changed since it was read. Read it again before saving.'
		);

	const { nodes: submitted, changed } = parse_submitted(input.edf, current.document.nodes);
	const nodes = { ...current.document.nodes, ...submitted };
	assert_uploaded_images(changed.map((id) => nodes[id]));

	await with_asset_cleanup(() =>
		unwrap_http_error(() =>
			save_translated_document({
				document_id,
				nodes,
				language,
				translation_revision: input.expected_version
			})
		)
	);
	void snapshot_if_stale();

	const saved = translated_document(document_id, language);
	return {
		ok: true,
		document_id,
		page_href: language_href(page_href_for(document_id), language, languages),
		title: extract_page_metadata(saved.document).title,
		language,
		version: saved.translation_revision
	};
}

export async function create_mcp_page(input: { edf: string; slug?: string }) {
	const parsed = parse_edf(input.edf, document_schema, { generate_id: nanoid });
	const { document_id } = parsed;
	if (get_optional_doc_from_db(document_id))
		throw new Error(`A document with id ${document_id} already exists. Choose a new id.`);
	const submitted = Object.fromEntries(
		Object.entries(parsed.nodes).map(([id, node]) => [id, normalize_node(node)])
	);
	const page_node = submitted[document_id];
	if (page_node?.type !== 'page') throw new Error('The root element must be a <page>.');

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
	const shared_ids = Object.keys(submitted).filter((id) => id in shared_nodes);
	if (shared_ids.length)
		throw new Error(
			`Node ids belong to the shared banner, navigation, or footer: ${shared_ids.join(', ')}. Leave shared nodes out of create_page.`
		);

	// Every page has a preview image node, empty until an image is chosen.
	if (page_node.image === undefined) {
		page_node.image = nanoid();
		submitted[page_node.image] = { id: page_node.image, type: 'image', ...MEDIA_DEFAULTS };
	}
	assert_uploaded_images(Object.values(submitted));

	const { page_doc, version } = await persist_combined_page(
		document_id,
		{ ...shared_nodes, ...submitted },
		{
			on_write: (page_doc) =>
				create_page_slug(
					document_id,
					input.slug || extract_page_metadata(page_doc).title || 'Untitled page'
				)
		}
	);
	return page_result(document_id, page_doc, version);
}
