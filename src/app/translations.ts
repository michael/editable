import nanoid from './nanoid.js';
import { document_schema } from './document_schema.js';
import type {
	Document,
	DocumentNode,
	NodeSchema,
	Text,
	PropertyDefinition,
	Inspection
} from 'svedit';

const schema: Record<string, NodeSchema> = document_schema;
export type TextTranslationPayload = Text & { nodes: Record<string, DocumentNode> };
export type MediaTranslationPayload = { node_id: string; nodes: Record<string, DocumentNode> };
export type TranslationPayload = TextTranslationPayload | MediaTranslationPayload;

export function is_media_property(property: PropertyDefinition | Inspection | undefined) {
	return (
		property?.type === 'node' &&
		'node_types' in property &&
		Array.isArray(property.node_types) &&
		property.node_types.length > 0 &&
		property.node_types.every((type: string) => type === 'image' || type === 'video')
	);
}

export function translation_properties(doc: Document) {
	return Object.values(doc.nodes).flatMap((node) =>
		Object.entries(schema[node.type]?.properties ?? {})
			.filter(([, property]) => property.type === 'text' || is_media_property(property))
			.map(([property_id]) => ({ node_id: node.id, property_id }))
	);
}

export function property_payload(
	doc: Document,
	node_id: string,
	property_id: string
): TranslationPayload {
	const property = schema[doc.nodes[node_id]?.type]?.properties[property_id];
	if (property?.type === 'text') return text_payload(doc, node_id, property_id);
	if (!is_media_property(property)) throw new Error('Property is not translatable');
	const media_id = doc.nodes[node_id][property_id];
	const media = doc.nodes[media_id];
	if (!media || property.type !== 'node' || !property.node_types.includes(media.type)) {
		throw new Error('Invalid translated media');
	}
	return { node_id: media_id, nodes: { [media_id]: structuredClone(media) } };
}

function referenced_ids(doc: Document) {
	const ids = new Set<string>();
	for (const node of Object.values(doc.nodes)) {
		for (const [key, property] of Object.entries(schema[node.type]?.properties ?? {})) {
			const value = node[key];
			if (property.type === 'node' && typeof value === 'string') ids.add(value);
			if (property.type === 'node_array') for (const id of value?.nodes ?? []) ids.add(id);
			if (property.type === 'text' || property.type === 'node_array') {
				for (const range of [...(value?.marks ?? []), ...(value?.annotations ?? [])])
					ids.add(range.node_id);
			}
		}
	}
	return ids;
}

function remove_unreferenced(doc: Document, ids: Iterable<string>) {
	const referenced = referenced_ids(doc);
	for (const id of ids) if (!referenced.has(id)) delete doc.nodes[id];
}

function remap_ids(doc: Document, nodes: Record<string, DocumentNode>) {
	const remapped = new Map<string, string>();
	const used_ids = new Set([...Object.keys(doc.nodes), ...Object.keys(nodes)]);
	for (const id of Object.keys(nodes)) {
		let next_id = id;
		if (doc.nodes[id]) {
			do next_id = nanoid();
			while (used_ids.has(next_id));
		}
		used_ids.add(next_id);
		remapped.set(id, next_id);
	}
	return remapped;
}

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
): TextTranslationPayload {
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
	return { ...translation, nodes };
}

export function normalized_payload(payload: TranslationPayload) {
	if ('node_id' in payload) {
		const node = payload.nodes[payload.node_id];
		if (!node || node.id !== payload.node_id || Object.keys(payload.nodes).length !== 1) {
			throw new Error('Invalid media payload');
		}
		const value = { ...node };
		delete value.id;
		return stable_json(value);
	}
	const nodes: Record<string, DocumentNode> = {};
	const { nodes: original_nodes, ...translation } = structuredClone(payload);
	const ids = new Map<string, string>();
	for (const range of [...translation.marks, ...translation.annotations]) {
		const original_id = range.node_id;
		if (!ids.has(original_id)) ids.set(original_id, `annotation${ids.size}`);
		const id = ids.get(original_id)!;
		range.node_id = id;
		nodes[id] = { ...original_nodes[original_id], id };
	}
	return stable_json({ ...translation, nodes });
}

/** Substitute on a disposable graph; the canonical document remains untouched. */
export function replace_translation(
	doc: Document,
	node_id: string,
	property_id: string,
	payload: TranslationPayload
) {
	const property = schema[doc.nodes[node_id]?.type]?.properties[property_id];
	if (is_media_property(property)) {
		if (!('node_id' in payload)) throw new Error('Expected media payload');
		normalized_payload(payload);
		const media = payload.nodes[payload.node_id];
		if (property.type !== 'node' || !property.node_types.includes(media.type))
			throw new Error('Unsupported media type');
		const old_id = doc.nodes[node_id][property_id];
		const next_id = remap_ids(doc, payload.nodes).get(payload.node_id)!;
		doc.nodes[next_id] = { ...structuredClone(media), id: next_id };
		doc.nodes[node_id][property_id] = next_id;
		remove_unreferenced(doc, [old_id]);
		return;
	}
	if (property?.type !== 'text' || 'node_id' in payload) {
		throw new Error('Translation target is not a text property');
	}
	const { nodes: payload_nodes, ...text } = payload;
	const local_doc = {
		document_id: doc.document_id,
		nodes: {
			...payload_nodes,
			[node_id]: { ...doc.nodes[node_id], [property_id]: text }
		}
	};
	const checked = text_payload(local_doc, node_id, property_id);
	if (Object.keys(checked.nodes).length !== Object.keys(payload_nodes).length) {
		throw new Error('Translation contains unreferenced nodes');
	}
	const original = text_payload(doc, node_id, property_id);
	const { nodes: checked_nodes, ...translation } = checked;
	const remapped = remap_ids(doc, checked_nodes);
	for (const range of [...translation.marks, ...translation.annotations])
		range.node_id = remapped.get(range.node_id)!;
	for (const [id, node] of Object.entries(checked_nodes)) {
		const next_id = remapped.get(id)!;
		doc.nodes[next_id] = { ...node, id: next_id };
	}
	doc.nodes[node_id][property_id] = translation;
	remove_unreferenced(doc, Object.keys(original.nodes));
}

/** Compare structure independently of text and property-owned attachment IDs. */
export function document_structure(doc: Document) {
	const copy = structuredClone(doc);
	const removed = new Set<string>();
	for (const { node_id, property_id } of translation_properties(doc)) {
		for (const id of Object.keys(property_payload(doc, node_id, property_id).nodes))
			removed.add(id);
		delete copy.nodes[node_id][property_id];
	}
	remove_unreferenced(copy, removed);
	return stable_json(copy);
}
