import { collect_asset_ids, translation_payloads } from '../src/lib/asset_references.js';

/** Read original and translated assets, including backups made before translations existed. */
export function referenced_assets(db) {
	const payloads = db
		.prepare('SELECT data FROM documents')
		.all()
		.map((row) => JSON.parse(row.data));
	if (
		db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'translations'").get()
	) {
		for (const row of db.prepare('SELECT value FROM translations').all())
			payloads.push(...translation_payloads(JSON.parse(row.value)));
	}
	return collect_asset_ids(payloads);
}
