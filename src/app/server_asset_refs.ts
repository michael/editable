import { db } from './services.js';
import { collect_asset_ids } from '../lib/asset_references.js';

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
	const assets = collect_asset_ids(payloads.map((json) => JSON.parse(json)));

	db.prepare('DELETE FROM asset_refs WHERE document_id = ?').run(document_id);
	const insert = db.prepare(
		'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)'
	);
	for (const id of assets) insert.run(id, document_id);
}
