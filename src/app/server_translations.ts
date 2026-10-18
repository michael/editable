import { site } from '#app/server_site.js';
import { is_media_property } from './media.js';
import { ASSET_ID_REGEX } from './config.js';
import { assert_safe_hrefs, normalize_hrefs, resolve_hrefs } from './document_links.js';
import { createHash } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { fill_document_defaults, validate_document, validate_node, type Document } from 'svedit';
import { backend, asset_exists } from './services.js';
import { asset_refs_of } from './server_asset_refs.js';
import {
	ConflictError,
	type DocumentRecord,
	type NewTranslation,
	type TranslationKey,
	type TranslationRecord
} from '#lib/server/backend.js';
import { document_schema } from './document_schema.js';
import { select_language } from './languages.js';
import {
	document_structure,
	normalized_payload,
	prepare_translation,
	remove_unreferenced,
	stable_json,
	property_payload,
	translation_properties,
	type TranslationMap
} from './translations.js';

type TranslationRow = { document_id: string; language: string; value: string };

/** A page's record and its shared documents', or a shared document's alone. */
async function load_records(document_id: string): Promise<DocumentRecord[]> {
	const read = async (id: string) =>
		(await backend.get_document(id)) ?? error(404, 'Document not found');
	const page = await read(document_id);
	const root = page.data.nodes[document_id];
	const shared = [root.banner, root.nav, root.footer].filter(
		(id): id is string => typeof id === 'string'
	);
	return [page, ...(await Promise.all(shared.map(read)))];
}

function read_rows(document_ids: string[], language: string) {
	return backend.list_translations({ document_ids, language });
}

/** Changes whenever any of the documents or their translations is written. */
function revision(records: DocumentRecord[], rows: TranslationRecord[]) {
	return [...records, ...rows].map((record) => record.version).join('.');
}

function compose(records: Document[]): Document {
	return fill_document_defaults(
		{
			document_id: records[0].document_id,
			nodes: Object.assign({}, ...records.map((doc) => doc.nodes))
		},
		document_schema
	);
}

export async function translated_document(document_id: string, requested?: string) {
	const { languages } = site;
	const language = select_language(languages, requested);
	const records = await load_records(document_id);
	const docs = records.map((record) => record.data);
	const rows =
		language && language !== languages[0]
			? await read_rows(
					docs.map((doc) => doc.document_id),
					language
				)
			: [];
	const document = overlay_document(compose(docs), docs, rows);
	return { document, language, languages, translation_revision: revision(records, rows) };
}

function parse_map(value: string): TranslationMap {
	const map = JSON.parse(value);
	if (!map || typeof map !== 'object' || Array.isArray(map))
		throw new Error('Invalid translation map');
	for (const properties of Object.values(map)) {
		if (!properties || typeof properties !== 'object' || Array.isArray(properties))
			throw new Error('Invalid translation properties');
	}
	return map;
}

function overlay_document(source: Document, records: Document[], rows: TranslationRow[]) {
	if (!rows.length) return source;
	const document = structuredClone(source);
	const removed_ids = new Set<string>();
	const owners = new Map(records.map((record) => [record.document_id, record.nodes]));
	for (const row of rows) {
		let map: TranslationMap;
		try {
			map = parse_map(row.value);
		} catch (err) {
			console.error('Ignoring invalid translation map', row.document_id, row.language, err);
			continue;
		}
		for (const [node_id, properties] of Object.entries(map)) {
			if (!owners.get(row.document_id)?.[node_id]) continue;
			for (const [property_id, payload] of Object.entries(properties)) {
				try {
					const replacement = prepare_translation(
						document,
						node_id,
						property_id,
						payload,
						// Stable collision IDs let saves match attachments to the same baseline.
						(id, attempt) =>
							'translation_' +
							createHash('sha256')
								.update(
									JSON.stringify([row.document_id, row.language, node_id, property_id, id, attempt])
								)
								.digest('hex')
								.slice(0, 24)
					);
					// Validate pending nodes without copying the whole node map.
					const candidate_nodes: Document['nodes'] = Object.assign(
						Object.create(document.nodes),
						replacement.nodes
					);
					for (const node of Object.values(replacement.nodes))
						validate_node(node, document_schema, candidate_nodes);
					Object.assign(document.nodes, replacement.nodes);
					for (const id of replacement.removed_ids) removed_ids.add(id);
				} catch (err) {
					console.error('Ignoring invalid translation', row.document_id, node_id, property_id, err);
				}
			}
		}
	}
	remove_unreferenced(document, removed_ids);
	validate_document(document, document_schema);
	return document;
}

function normalized_map(map: TranslationMap) {
	return stable_json(
		Object.fromEntries(
			Object.entries(map).map(([node_id, properties]) => [
				node_id,
				Object.fromEntries(
					Object.entries(properties).map(([property_id, payload]) => [
						property_id,
						normalized_payload(payload)
					])
				)
			])
		)
	);
}

/**
 * What storing map in place of previous takes: a new row, a removed one when
 * nothing is left to override, or nothing when it is unchanged.
 */
function map_change(
	document_id: string,
	language: string,
	map: TranslationMap,
	previous?: string
): { put?: NewTranslation; delete?: TranslationKey } {
	if (!Object.keys(map).length) return previous ? { delete: { document_id, language } } : {};
	if (previous) {
		try {
			if (normalized_map(map) === normalized_map(parse_map(previous))) return {};
		} catch {
			// Saving or cleanup replaces malformed stored overrides.
		}
	}
	const value = JSON.stringify(map);
	return { put: { document_id, language, value, updated_at: new Date().toISOString() } };
}

export async function translate_shared_document(source: Document, requested: string) {
	const language = select_language(site.languages, requested);
	if (!language || language === site.languages[0]) return source;
	return resolve_hrefs(
		overlay_document(
			fill_document_defaults(source, document_schema),
			[source],
			await read_rows([source.document_id], language)
		),
		site,
		language
	);
}

export async function save_translated_document(input: {
	document_id: string;
	nodes: Document['nodes'];
	language: string;
	translation_revision: string;
}) {
	const { languages } = site;
	if (!languages.includes(input.language) || input.language === languages[0])
		error(400, 'Translation language is not enabled');
	const records = await load_records(input.document_id);
	const docs = records.map((record) => record.data);
	const document_ids = docs.map((doc) => doc.document_id);
	const rows = await read_rows(document_ids, input.language);
	const stale_message =
		'This page or its translations changed. Keep a copy of your edits and reload before saving.';
	if (revision(records, rows) !== input.translation_revision) error(409, stale_message);
	const original = compose(docs);
	const edited = normalize_hrefs(
		fill_document_defaults({ document_id: input.document_id, nodes: input.nodes }, document_schema),
		overlay_document(original, docs, rows),
		site,
		input.language
	);
	try {
		validate_document(edited, document_schema);
		assert_safe_hrefs(edited.nodes);
		if (document_structure(original) !== document_structure(edited)) {
			error(
				400,
				'Translations can save text, inline formatting, and media only. Make structure and layout changes in the main language. Your draft is still open.'
			);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		error(400, `Invalid translated document: ${err instanceof Error ? err.message : err}`);
	}
	const maps = new Map(document_ids.map((id) => [id, {} as TranslationMap]));
	const owners = new Map(
		docs.flatMap((doc) =>
			Object.keys(doc.nodes).map((node_id) => [node_id, doc.document_id] as const)
		)
	);
	for (const { node_id, property_id } of translation_properties(original)) {
		const owner_id = owners.get(node_id);
		if (!owner_id) error(400, 'Unknown translation owner');
		const payload = property_payload(edited, node_id, property_id);
		if (
			normalized_payload(payload) ===
			normalized_payload(property_payload(original, node_id, property_id))
		)
			continue;
		if ('node_id' in payload) {
			const media = payload.nodes[payload.node_id];
			if (media.src && (!ASSET_ID_REGEX.test(media.src) || !(await asset_exists(media.src))))
				error(400, 'Upload translated media before saving. Your draft is still open.');
		}
		const map = maps.get(owner_id)!;
		(map[node_id] ??= {})[property_id] = payload;
	}

	const previous = (document_id: string) => rows.find((row) => row.document_id === document_id);
	const changes = document_ids.map((id) =>
		map_change(id, input.language, maps.get(id)!, previous(id)?.value)
	);
	// Asset references cover every language, with this one's rows as they will be.
	const other_languages = (await backend.list_translations({ document_ids })).filter(
		(row) => row.language !== input.language
	);
	const rows_after = (document_id: string, index: number) => {
		const change = changes[index];
		const own = change.put ?? (change.delete ? undefined : previous(document_id));
		return [
			...other_languages.filter((row) => row.document_id === document_id),
			...(own ? [own] : [])
		];
	};
	await backend
		.save_translations({
			expect: {
				documents: Object.fromEntries(
					records.map((record) => [record.document_id, record.version])
				),
				translations: document_ids.map((document_id) => ({
					document_id,
					language: input.language,
					version: previous(document_id)?.version ?? null
				}))
			},
			put: changes.flatMap((change) => (change.put ? [change.put] : [])),
			delete: changes.flatMap((change) => (change.delete ? [change.delete] : [])),
			asset_refs: docs.map((doc, index) => asset_refs_of(doc, rows_after(doc.document_id, index)))
		})
		.catch((err) => {
			if (err instanceof ConflictError) error(409, stale_message);
			throw err;
		});
	return { ok: true };
}

/**
 * What a document's translations become once it is saved: overrides of
 * properties it no longer has, or that equal the original, are dropped, and a
 * malformed or emptied row is removed. kept holds the rows as they will be.
 */
export function clean_translations(document: Document, rows: TranslationRow[]) {
	const doc = fill_document_defaults(document, document_schema);
	const put: NewTranslation[] = [];
	const remove: TranslationKey[] = [];
	const kept: { value: string }[] = [];
	for (const entry of rows) {
		let map: TranslationMap;
		try {
			map = parse_map(entry.value);
		} catch {
			remove.push({ document_id: entry.document_id, language: entry.language });
			continue;
		}
		for (const [node_id, properties] of Object.entries(map)) {
			for (const [property_id, payload] of Object.entries(properties)) {
				const property = document_schema[doc.nodes[node_id]?.type]?.properties[property_id];
				let drop = property?.type !== 'text' && !is_media_property(property);
				if (!drop) {
					try {
						const replacement = prepare_translation(doc, node_id, property_id, payload);
						const candidate_nodes: Document['nodes'] = Object.assign(
							Object.create(doc.nodes),
							replacement.nodes
						);
						// Shared banner/nav/footer references live in their own document records.
						for (const node of Object.values(replacement.nodes))
							validate_node(node, document_schema, candidate_nodes, { require_references: false });
						drop =
							normalized_payload(payload) ===
							normalized_payload(property_payload(doc, node_id, property_id));
					} catch {
						drop = true;
					}
				}
				if (drop) delete properties[property_id];
			}
			if (!Object.keys(properties).length) delete map[node_id];
		}
		const change = map_change(entry.document_id, entry.language, map, entry.value);
		if (change.put) put.push(change.put);
		if (change.delete) remove.push(change.delete);
		else kept.push(change.put ?? entry);
	}
	return { put, delete: remove, kept };
}
