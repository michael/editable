import { MEDIA_DEFAULTS } from './document_schema.js';
import { is_media_property } from './translations.js';
import type { DocumentPath, Transaction, DocumentNode } from 'svedit';

/** Detach media edits from other properties that may share the same original node. */
export function update_media(
	tr: Transaction,
	path: DocumentPath,
	properties: Partial<DocumentNode>,
	detach = false
) {
	if (detach) {
		const node = tr.get(path);
		const next_id = tr.generate_id();
		tr.create({ ...node, ...properties, id: next_id });
		tr.set(path, next_id);
	} else {
		for (const [key, value] of Object.entries(properties)) tr.set([...path, key], value);
	}
}

export function delete_media(tr: Transaction, path: DocumentPath, detach = false) {
	const property = tr.inspect(path);
	if (property?.type !== 'node' || (detach && !is_media_property(property))) return;
	const node = tr.get(path);
	if (node?.type !== 'image' && node?.type !== 'video') return;
	update_media(tr, path, MEDIA_DEFAULTS, detach);
}

/** Paste Svedit's copied media property without changing the surrounding structure. */
export function paste_translated_media(tr: Transaction, path: DocumentPath, html: string): boolean {
	const property = tr.inspect(path);
	if (!is_media_property(property)) return false;
	const encoded = html.match(/data-svedit="([^"]+)"/)?.[1];
	if (!encoded) return false;
	let payload;
	try {
		payload = JSON.parse(decodeURIComponent(atob(encoded)));
	} catch {
		return false;
	}
	if (
		payload?.kind !== 'property' ||
		payload.type !== 'node' ||
		!['image', 'video'].includes(payload.value?.type) ||
		!property.node_types?.includes(payload.value.type)
	)
		return false;
	update_media(tr, path, payload.value, true);
	return true;
}
