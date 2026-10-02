import { languages } from '#app/server_languages.js';
import { is_media_property } from './media.js';
import { rebuild_asset_refs } from './server_asset_refs.js';
import { ASSET_ID_REGEX } from './config.js';
import { restore_document_links, translate_document_links } from './document_links.js';
import { createHash } from 'node:crypto';
import { ORIGIN } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { fill_document_defaults, validate_document, validate_node, type Document } from 'svedit';
import { db, with_transaction, asset_exists } from './services.js';
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

type TranslationRow = {
	document_id: string;
	language: string;
	value: string;
};

function load_records(document_id: string) {
	const read = (id: string): Document => {
		const row = db.prepare('SELECT data FROM documents WHERE document_id = ?').get(id) as
			{ data: string } | undefined;
		if (!row) error(404, 'Document not found');
		return JSON.parse(row.data);
	};
	const page = read(document_id);
	const root = page.nodes[document_id];
	return [
		page,
		...[root.nav, root.footer].filter((id): id is string => typeof id === 'string').map(read)
	];
}

function read_rows(records: Document[], language: string): TranslationRow[] {
	return db
		.prepare(
			`SELECT * FROM translations WHERE language = ? AND document_id IN (${records.map(() => '?').join(',')}) ORDER BY document_id`
		)
		.all(language, ...records.map((doc) => doc.document_id)) as TranslationRow[];
}

function revision(records: Document[], rows: TranslationRow[]) {
	return createHash('sha256').update(stable_json({ records, rows })).digest('hex');
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

export function translated_document(document_id: string, requested?: string) {
	const language = select_language(languages, requested);
	const records = load_records(document_id);
	const rows = language && language !== languages[0] ? read_rows(records, language) : [];
	const document = translate_document_links(
		overlay_document(compose(records), records, rows),
		language !== languages[0] ? language : '',
		ORIGIN,
		languages
	);
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

function write_map(document_id: string, language: string, map: TranslationMap, previous?: string) {
	if (!Object.keys(map).length) {
		db.prepare('DELETE FROM translations WHERE document_id = ? AND language = ?').run(
			document_id,
			language
		);
		return;
	}
	if (previous) {
		try {
			if (normalized_map(map) === normalized_map(parse_map(previous))) return;
		} catch {
			// Saving or cleanup replaces malformed stored overrides.
		}
	}
	db.prepare(
		'INSERT INTO translations (document_id, language, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(document_id, language) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
	).run(document_id, language, JSON.stringify(map), new Date().toISOString());
}

export function translate_shared_document(source: Document, requested: string) {
	const language = select_language(languages, requested);
	if (!language || language === languages[0]) return source;
	return translate_document_links(
		overlay_document(
			fill_document_defaults(source, document_schema),
			[source],
			read_rows([source], language)
		),
		language,
		ORIGIN,
		languages
	);
}

export function save_translated_document(input: {
	document_id: string;
	nodes: Document['nodes'];
	language: string;
	translation_revision: string;
}) {
	if (!languages.includes(input.language) || input.language === languages[0])
		error(400, 'Translation language is not enabled');
	return with_transaction(() => {
		const records = load_records(input.document_id);
		const rows = read_rows(records, input.language);
		if (revision(records, rows) !== input.translation_revision)
			error(
				409,
				'This page or its translations changed. Keep a copy of your edits and reload before saving.'
			);
		const original = compose(records);
		const edited = restore_document_links(
			fill_document_defaults(
				{ document_id: input.document_id, nodes: input.nodes },
				document_schema
			),
			overlay_document(original, records, rows),
			input.language,
			ORIGIN,
			languages
		);
		try {
			validate_document(edited, document_schema);
			if (document_structure(original) !== document_structure(edited)) {
				error(
					400,
					'Translations can save text, inline formatting, and media only. Make structure and layout changes in the main language. Your draft is still open.'
				);
			}
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) throw err;
			error(400, 'Invalid translated document');
		}
		const maps = new Map(records.map((record) => [record.document_id, {} as TranslationMap]));
		const owners = new Map(
			records.flatMap((record) =>
				Object.keys(record.nodes).map((node_id) => [node_id, record.document_id] as const)
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
				if (media.src && (!ASSET_ID_REGEX.test(media.src) || !asset_exists(media.src)))
					error(400, 'Upload translated media before saving. Your draft is still open.');
			}
			const map = maps.get(owner_id)!;
			(map[node_id] ??= {})[property_id] = payload;
		}
		for (const [document_id, map] of maps)
			write_map(
				document_id,
				input.language,
				map,
				rows.find((row) => row.document_id === document_id)?.value
			);
		for (const record of records) rebuild_asset_refs(record.document_id);
		return { ok: true };
	});
}

export function cleanup_translations(document_id: string) {
	const row = db.prepare('SELECT data FROM documents WHERE document_id = ?').get(document_id) as
		{ data: string } | undefined;
	if (!row) {
		db.prepare('DELETE FROM translations WHERE document_id = ?').run(document_id);
		return;
	}
	const doc = fill_document_defaults(JSON.parse(row.data), document_schema);
	const rows = db
		.prepare('SELECT * FROM translations WHERE document_id = ?')
		.all(document_id) as TranslationRow[];
	for (const entry of rows) {
		let map: TranslationMap;
		try {
			map = parse_map(entry.value);
		} catch {
			db.prepare('DELETE FROM translations WHERE document_id = ? AND language = ?').run(
				document_id,
				entry.language
			);
			continue;
		}
		for (const [node_id, properties] of Object.entries(map)) {
			for (const [property_id, payload] of Object.entries(properties)) {
				const property = document_schema[doc.nodes[node_id]?.type]?.properties[property_id];
				let remove = property?.type !== 'text' && !is_media_property(property);
				if (!remove) {
					try {
						const replacement = prepare_translation(doc, node_id, property_id, payload);
						const candidate_nodes: Document['nodes'] = Object.assign(
							Object.create(doc.nodes),
							replacement.nodes
						);
						// Shared nav/footer references live in their own document records.
						for (const node of Object.values(replacement.nodes))
							validate_node(node, document_schema, candidate_nodes, { require_references: false });
						remove =
							normalized_payload(payload) ===
							normalized_payload(property_payload(doc, node_id, property_id));
					} catch {
						remove = true;
					}
				}
				if (remove) delete properties[property_id];
			}
			if (!Object.keys(properties).length) delete map[node_id];
		}
		write_map(document_id, entry.language, map, entry.value);
	}
}
