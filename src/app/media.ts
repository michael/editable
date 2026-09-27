import { MEDIA_DEFAULTS } from './document_schema.js';
import type {
	DocumentPath,
	Transaction,
	DocumentNode,
	PropertyDefinition,
	Inspection,
	Session
} from 'svedit';

export function is_media_property(property: PropertyDefinition | Inspection | undefined) {
	return (
		property?.type === 'node' &&
		'node_types' in property &&
		Array.isArray(property.node_types) &&
		property.node_types.length > 0 &&
		property.node_types.every((type: string) => type === 'image' || type === 'video')
	);
}

export function is_media_selection(session: Pick<Session, 'selection' | 'inspect'>) {
	return (
		session.selection?.type === 'property' &&
		is_media_property(session.inspect(session.selection.path))
	);
}

/** Media belongs to its field: replacing it must leave other references untouched. */
export function update_media(
	tr: Transaction,
	path: DocumentPath,
	properties: Partial<DocumentNode>
) {
	const property = tr.inspect(path);
	if (!is_media_property(property)) return false;
	const node = { ...tr.get(path), ...properties, id: tr.generate_id() };
	if (!property.node_types.includes(node.type)) return false;
	tr.create(node);
	tr.set(path, node.id);
	return true;
}

export function delete_media(tr: Transaction, path: DocumentPath) {
	update_media(tr, path, MEDIA_DEFAULTS);
}

/** Paste Svedit's copied media property without changing the surrounding structure. */
export function paste_media(tr: Transaction, path: DocumentPath, html: string): boolean {
	const encoded = html.match(/data-svedit="([^"]+)"/)?.[1];
	if (!encoded) return false;
	let payload;
	try {
		payload = JSON.parse(decodeURIComponent(atob(encoded)));
	} catch {
		return false;
	}
	if (payload?.kind !== 'property' || payload.type !== 'node' || !payload.value?.type) return false;
	return update_media(tr, path, payload.value);
}
