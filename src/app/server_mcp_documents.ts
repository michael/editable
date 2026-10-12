import { isHttpError } from '@sveltejs/kit';
import {
	fill_node_defaults,
	type Attachment,
	type DocumentNode,
	type PropertyDefinition
} from 'svedit';
import { snapshot_if_stale } from '#lib/server/db_snapshot.js';
import { edf_root_id, parse_edf, serialize_edf } from '#lib/edf.js';
import { get_site } from './server_site.js';
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
	get_document_version,
	get_home_page_id_from_db,
	get_optional_doc_from_db,
	persist_document,
	resolve_slug,
	shared_document_types,
	with_asset_cleanup
} from './server_documents.js';

/**
 * Resolve the ways agents refer to documents: a document id, which also
 * covers the shared banner, nav, and footer, or a page path or full URL
 * (whose host is ignored), including language prefixes and old slugs. The
 * language comes from the path prefix and defaults to the main language.
 */
function resolve_document(reference: string): { document_id: string | null; language: string } {
	const { languages } = get_site();
	if (get_optional_doc_from_db(reference))
		return { document_id: reference, language: languages[0] ?? '' };

	let href = reference.trim();
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

/** The translation language to read or write, or null for the main language. */
function translation_language(language: string | undefined): string | null {
	const { languages } = get_site();
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

function page_href_for(document_id: string, language: string | null): string {
	const { languages } = get_site();
	const slug = get_active_slug_for_document_id(document_id);
	const href = slug ? `/${slug}` : '/';
	return language ? language_href(href, language, languages) : href;
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

/**
 * Read a page or a shared document as EDF. A page references its banner, nav,
 * and footer by id; they are documents of their own.
 */
export function read_mcp_document(reference: string, requested_language?: string) {
	const { languages } = get_site();
	const { document_id, language: path_language } = resolve_document(reference);
	const stored = document_id && get_optional_doc_from_db(document_id);
	if (!document_id || !stored)
		throw new Error(
			`Document not found: ${reference}. Use a page path such as /about, a full URL, or a document id from list_pages or a page's banner, nav, or footer attribute.`
		);

	const is_page = stored.nodes[document_id]?.type === 'page';
	const language = translation_language(requested_language ?? path_language);
	const translated =
		language && unwrap_http_error(() => translated_document(document_id, language));
	const document = translated
		? translated.document
		: is_page
			? combine_page_document(stored)
			: stored;
	return {
		document_id,
		page_href: is_page ? page_href_for(document_id, language) : null,
		language: language ?? languages[0] ?? null,
		languages,
		version: translated ? translated.translation_revision : get_document_version(document_id),
		edf: serialize_edf(document, document_schema, {
			exclude: is_page ? shared_ids_of(document.nodes[document_id]) : []
		})
	};
}

/**
 * Parse a submitted document against the stored nodes. Unchanged nodes
 * resolve to the stored objects, so a write without edits changes nothing;
 * changed and new nodes are filled with defaults.
 */
function parse_submitted(edf: string, stored_nodes: Record<string, DocumentNode>) {
	const parsed = parse_edf(edf, document_schema, { generate_id: nanoid });
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
	return { nodes, changed };
}

/**
 * A document contains all of its nodes. A node property written as an
 * attribute refers to another document, which only a page's banner, nav,
 * and footer do.
 */
function assert_self_contained(document_id: string, submitted: Record<string, DocumentNode>) {
	for (const node of Object.values(submitted)) {
		for (const [name, definition] of Object.entries<PropertyDefinition>(
			document_schema[node.type]?.properties ?? {}
		)) {
			const value = node[name];
			if (definition.type !== 'node' || value === undefined || value in submitted) continue;
			if (node.id === document_id && (shared_document_types as readonly string[]).includes(name))
				continue;
			throw new Error(
				`${node.id}.${name} refers to ${value}, which is not in this document. Write the node inside <${name}>; only a page's banner, nav, and footer refer to other documents.`
			);
		}
	}
}

/** A page keeps its shared references and never carries their content. */
function assert_shared_documents_untouched(
	page: DocumentData,
	submitted: Record<string, DocumentNode>
) {
	const page_node = page.nodes[page.document_id];
	for (const type of shared_document_types) {
		const shared_id = page_node[type] as string;
		const nested = Object.keys(get_doc_from_db(shared_id).nodes).some((id) => id in submitted);
		if (submitted[page.document_id][type] !== shared_id || nested)
			throw new Error(
				`Keep ${type}="${shared_id}" on the page and leave its content out. The ${type} is a document of its own: read_document ${shared_id}, then write_document.`
			);
	}
}

function write_result(
	document_id: string,
	document: DocumentData,
	version: string,
	language: string | null
) {
	const is_page = document.nodes[document_id]?.type === 'page';
	return {
		ok: true,
		document_id,
		...(is_page && {
			page_href: page_href_for(document_id, language),
			title: extract_page_metadata(document).title
		}),
		...(language && { language }),
		version
	};
}

/**
 * Write a complete page or shared document. Nodes left out are deleted. A
 * translation can change text, inline formatting, and media only; the
 * translation module keeps what differs from the main language.
 */
export async function write_mcp_document(input: {
	edf: string;
	expected_version: string;
	language?: string;
}) {
	const document_id = edf_root_id(input.edf);
	const stored = get_optional_doc_from_db(document_id);
	if (!stored)
		throw new Error(
			`Existing document not found: ${document_id}. The root element's id must be a document id from read_document; create pages with create_page.`
		);
	const root_type = stored.nodes[document_id].type;
	const language = translation_language(input.language);
	const translated =
		language && unwrap_http_error(() => translated_document(document_id, language));
	const version = translated ? translated.translation_revision : get_document_version(document_id);
	// Check up front so a stale document is not reported as invalid.
	if (version !== input.expected_version)
		throw new Error('The document changed since it was read. Read it again before writing.');

	const stored_nodes = translated
		? translated.document.nodes
		: root_type === 'page'
			? combine_page_document(stored).nodes
			: stored.nodes;
	const { nodes: submitted, changed } = parse_submitted(input.edf, stored_nodes);
	if (submitted[document_id].type !== root_type)
		throw new Error(
			`${document_id} is a ${root_type}: write it as <${root_type} id="${document_id}">.`
		);
	assert_self_contained(document_id, submitted);
	if (root_type === 'page') assert_shared_documents_untouched(stored, submitted);
	const nodes = { ...stored_nodes, ...submitted };
	assert_uploaded_images(changed.map((id) => nodes[id]));

	if (!translated) {
		const { doc, version } = await persist_document(document_id, nodes, {
			expected_version: input.expected_version
		});
		return write_result(document_id, doc, version, null);
	}

	await with_asset_cleanup(() =>
		unwrap_http_error(() =>
			save_translated_document({
				document_id,
				nodes,
				language: translated.language,
				translation_revision: input.expected_version
			})
		)
	);
	void snapshot_if_stale();
	const saved = translated_document(document_id, translated.language);
	return write_result(document_id, saved.document, saved.translation_revision, saved.language);
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
	assert_self_contained(document_id, submitted);

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

	const { doc, version } = await persist_document(
		document_id,
		{ ...shared_nodes, ...submitted },
		{
			on_write: (doc) =>
				create_page_slug(
					document_id,
					input.slug || extract_page_metadata(doc).title || 'Untitled page'
				)
		}
	);
	return write_result(document_id, doc, version, null);
}
