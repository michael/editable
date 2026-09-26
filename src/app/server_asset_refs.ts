import { db } from './services.js';
import type { DocumentNode } from 'svedit';

/** Rebuild the union of original and all-language media references atomically with saves. */
export function rebuild_asset_refs(document_id: string) {
	const record = db.prepare('SELECT data FROM documents WHERE document_id = ?').get(document_id) as
		{ data: string } | undefined;
	const payloads = record
		? [
				record.data,
				...(
					db.prepare('SELECT value FROM translations WHERE document_id = ?').all(document_id) as {
						value: string;
					}[]
				).map((row) => row.value)
			]
		: [];
	const assets = new Set<string>();
	for (const json of payloads) {
		const payload = JSON.parse(json);
		for (const node of Object.values(payload.nodes ?? {}) as DocumentNode[]) {
			if (
				(node.type === 'image' || node.type === 'video') &&
				typeof node.src === 'string' &&
				node.src &&
				!node.src.startsWith('blob:')
			)
				assets.add(node.src);
		}
	}
	db.prepare('DELETE FROM asset_refs WHERE document_id = ?').run(document_id);
	const insert = db.prepare(
		'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)'
	);
	for (const id of assets) insert.run(id, document_id);
}
