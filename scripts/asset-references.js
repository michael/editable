import { collect_asset_ids } from '../src/lib/asset_references.js';

/** Read original and translated assets, including backups made before translations existed. */
export function referenced_assets(db) {
	const rows = db.prepare('SELECT data FROM documents').all();
	if (
		db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'translations'").get()
	) {
		rows.push(...db.prepare('SELECT value AS data FROM translations').all());
	}
	return collect_asset_ids(rows.map((row) => JSON.parse(row.data)));
}
