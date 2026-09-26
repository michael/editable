import { rebuild_asset_refs } from './server_asset_refs.js';
import { ASSET_ID_REGEX } from './config.js';
import { restore_document_links, translate_document_links } from './document_links.js';
import { createHash } from 'node:crypto';
import { LANGUAGES, ORIGIN, VERCEL } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { fill_document_defaults, validate_document, type Document } from 'svedit';
import { db, with_transaction, asset_exists } from './services.js';
import { document_schema } from './document_schema.js';
import { parse_languages, select_language } from './languages.js';
import {
	document_structure,
	normalized_payload,
	replace_translation,
	stable_json,
	property_payload,
	translation_properties,
	is_media_property
} from './translations.js';

type TranslationRow = {
	document_id: string;
	language: string;
	node_id: string;
	property_id: string;
	value: string;
};
export const languages = VERCEL ? [] : parse_languages(LANGUAGES);

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
			`SELECT * FROM translations WHERE language = ? AND document_id IN (${records.map(() => '?').join(',')}) ORDER BY document_id, node_id, property_id`
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
		ORIGIN
	);
	return { document, language, languages, translation_revision: revision(records, rows) };
}

function overlay_document(source: Document, records: Document[], rows: TranslationRow[]) {
	let document = source;
	for (const row of rows) {
		try {
			if (!records.find((record) => record.document_id === row.document_id)?.nodes[row.node_id])
				continue;
			const next = structuredClone(document);
			replace_translation(next, row.node_id, row.property_id, JSON.parse(row.value));
			validate_document(next, document_schema);
			document = next;
		} catch (err) {
			console.error(
				'Ignoring invalid translation',
				row.document_id,
				row.node_id,
				row.property_id,
				err
			);
		}
	}
	return document;
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
		ORIGIN
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
			ORIGIN
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
		const upsert = db.prepare(
			'INSERT INTO translations (document_id, language, node_id, property_id, value, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(document_id, language, node_id, property_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
		);
		const remove = db.prepare(
			'DELETE FROM translations WHERE document_id = ? AND language = ? AND node_id = ? AND property_id = ?'
		);
		for (const { node_id, property_id } of translation_properties(original)) {
			const owner = records.find((doc) => doc.nodes[node_id]);
			if (!owner) error(400, 'Unknown translation owner');
			const payload = property_payload(edited, node_id, property_id);

			const key = [owner.document_id, input.language, node_id, property_id];
			if (
				normalized_payload(payload) ===
				normalized_payload(property_payload(original, node_id, property_id))
			)
				remove.run(...key);
			else {
				if ('node_id' in payload) {
					const media = payload.nodes[payload.node_id];
					if (media.src && (!ASSET_ID_REGEX.test(media.src) || !asset_exists(media.src))) {
						error(400, 'Upload translated media before saving. Your draft is still open.');
					}
				}
				const existing = rows.find(
					(row) =>
						row.document_id === owner.document_id &&
						row.node_id === node_id &&
						row.property_id === property_id
				);
				if (
					!existing ||
					normalized_payload(JSON.parse(existing.value)) !== normalized_payload(payload)
				)
					upsert.run(...key, JSON.stringify(payload), new Date().toISOString());
			}
		}
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
	const doc: Document = JSON.parse(row.data);
	const rows = db
		.prepare('SELECT * FROM translations WHERE document_id = ?')
		.all(document_id) as TranslationRow[];
	for (const entry of rows) {
		const property = document_schema[doc.nodes[entry.node_id]?.type]?.properties[entry.property_id];
		let remove = property?.type !== 'text' && !is_media_property(property);
		if (!remove) {
			try {
				const payload = JSON.parse(entry.value);
				// A property may have changed its allowed types since this override was saved.
				remove =
					'node_id' in payload
						? !is_media_property(property) ||
							property.type !== 'node' ||
							!property.node_types.includes(payload.nodes[payload.node_id]?.type)
						: property.type !== 'text';
				if (!remove)
					remove =
						normalized_payload(payload) ===
						normalized_payload(property_payload(doc, entry.node_id, entry.property_id));
			} catch {
				// Invalid overrides already fall back on reads and must not retain orphaned assets.
				remove = true;
			}
		}
		if (remove)
			db.prepare(
				'DELETE FROM translations WHERE document_id = ? AND language = ? AND node_id = ? AND property_id = ?'
			).run(document_id, entry.language, entry.node_id, entry.property_id);
	}
}
