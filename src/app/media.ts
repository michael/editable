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

/** Image/video nodes have one owning field; edits preserve identity unless the type changes. */
export function update_media(
	tr: Transaction,
	path: DocumentPath,
	properties: Partial<DocumentNode>,
	replace_node = false
) {
	const property = tr.inspect(path);
	if (!is_media_property(property)) return false;
	const current = tr.get(path);
	const type = properties.type ?? current.type;
	if (!property.node_types.includes(type)) return false;
	const { id: _id, ...changes } = properties;
	if (!replace_node && Object.entries(changes).every(([key, value]) => current[key] === value))
		return true;
	if (replace_node || type !== current.type) {
		const node = {
			...(type === current.type ? current : MEDIA_DEFAULTS),
			...changes,
			type,
			id: tr.generate_id()
		};
		tr.create(node);
		tr.set(path, node.id);
	} else {
		for (const [key, value] of Object.entries(changes)) {
			if (current[key] !== value) tr.set([current.id, key], value);
		}
	}
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
	return update_media(tr, path, payload.value, true);
}
