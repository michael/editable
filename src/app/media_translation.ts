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
