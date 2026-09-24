import { document_schema } from './document_schema.js';
import type { Document, DocumentNode, NodeSchema, Text } from 'svedit';

const schema: Record<string, NodeSchema> = document_schema;
export type TranslationPayload = { translation: Text; nodes: Record<string, DocumentNode> };

export function stable_json(value: unknown): string {
	return JSON.stringify(value, (_key, entry) =>
		entry && typeof entry === 'object' && !Array.isArray(entry)
			? Object.fromEntries(
					Object.keys(entry)
						.sort()
						.map((key) => [key, entry[key]])
				)
			: entry
	);
}

export function text_properties(doc: Document) {
	return Object.values(doc.nodes).flatMap((node) =>
		Object.entries(schema[node.type]?.properties ?? {})
			.filter(([, definition]) => definition.type === 'text')
			.map(([property_id]) => ({ node_id: node.id, property_id }))
	);
}

export function text_payload(
	doc: Document,
	node_id: string,
	property_id: string
): TranslationPayload {
	const translation: Text = structuredClone(doc.nodes[node_id][property_id]);
	const nodes: Record<string, DocumentNode> = {};
	for (const range of [...translation.marks, ...translation.annotations]) {
		const node = doc.nodes[range.node_id];
		if (!node || !['mark', 'annotation'].includes(schema[node.type]?.kind)) {
			throw new Error('Invalid text attachment');
		}
		// Current text attachment schemas contain scalar properties only.
		if (
			Object.values(schema[node.type].properties).some((property) =>
				['text', 'node', 'node_array'].includes(property.type)
			)
		) {
			throw new Error('Nested text attachments are not supported by experimental translations.');
		}
		nodes[node.id] = structuredClone(node);
	}
	return { translation, nodes };
}

export function normalized_payload(payload: TranslationPayload) {
	const nodes: Record<string, DocumentNode> = {};
	const translation = structuredClone(payload.translation);
	const ids = new Map<string, string>();
	for (const range of [...translation.marks, ...translation.annotations]) {
		const original_id = range.node_id;
		if (!ids.has(original_id)) ids.set(original_id, `annotation${ids.size}`);
		const id = ids.get(original_id)!;
		range.node_id = id;
		nodes[id] = { ...payload.nodes[original_id], id };
	}
	return stable_json({ translation, nodes });
}

/** Substitute on a disposable graph; the canonical document remains untouched. */
export function replace_translation(
	doc: Document,
	node_id: string,
	property_id: string,
	payload: TranslationPayload
) {
	if (schema[doc.nodes[node_id]?.type]?.properties[property_id]?.type !== 'text') {
		throw new Error('Translation target is not a text property');
	}
	const local_doc = {
		document_id: doc.document_id,
		nodes: {
			...payload.nodes,
			[node_id]: { ...doc.nodes[node_id], [property_id]: payload.translation }
		}
	};
	const checked = text_payload(local_doc, node_id, property_id);
	if (Object.keys(checked.nodes).length !== Object.keys(payload.nodes).length) {
		throw new Error('Translation contains unreferenced nodes');
	}
	const original = text_payload(doc, node_id, property_id);
	const translation = structuredClone(checked.translation);
	const remapped = new Map<string, string>();
	for (const id of Object.keys(checked.nodes)) {
		let next_id = `translation-${node_id}-${property_id}-${remapped.size}`;
		while (doc.nodes[next_id]) next_id = `t-${next_id}`;
		remapped.set(id, next_id);
	}
	for (const id of Object.keys(original.nodes)) delete doc.nodes[id];
	for (const range of [...translation.marks, ...translation.annotations])
		range.node_id = remapped.get(range.node_id)!;
	for (const [id, node] of Object.entries(checked.nodes)) {
		const next_id = remapped.get(id)!;
		doc.nodes[next_id] = { ...node, id: next_id };
	}
	doc.nodes[node_id][property_id] = translation;
}

/** Compare structure independently of text and property-owned attachment IDs. */
export function document_structure(doc: Document) {
	const copy = structuredClone(doc);
	for (const { node_id, property_id } of text_properties(doc)) {
		for (const id of Object.keys(text_payload(doc, node_id, property_id).nodes))
			delete copy.nodes[id];
		delete copy.nodes[node_id][property_id];
	}
	return stable_json(copy);
}
