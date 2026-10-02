import { collect_asset_ids, translation_payloads } from '../src/lib/asset_references.js';

/** @param {import('node:sqlite').DatabaseSync} db */
export function list_translations(db) {
	if (
		!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'translations' AND type = 'table'").get()
	)
		return [];
	return db
		.prepare(
			'SELECT language, count(*) AS documents FROM translations GROUP BY language ORDER BY language'
		)
		.all();
}

/**
 * Purge one language and rebuild affected references under the same write lock.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} language
 * @param {(asset_id: string) => void} release_asset
 */
export function purge_translations(db, language, release_asset = () => {}) {
	const canonical = Intl.getCanonicalLocales(language)[0];
	if (!canonical || canonical !== language)
		throw new Error('Use a canonical language tag, e.g. es or pt-BR');
	db.exec('BEGIN IMMEDIATE');
	try {
		const before = new Set(
			db
				.prepare('SELECT DISTINCT asset_id FROM asset_refs')
				.all()
				.map((row) => row.asset_id)
		);
		const documents = db
			.prepare('SELECT document_id FROM translations WHERE language = ?')
			.all(language);
		db.prepare('DELETE FROM translations WHERE language = ?').run(language);
		const delete_refs = db.prepare('DELETE FROM asset_refs WHERE document_id = ?');
		const insert_ref = db.prepare(
			'INSERT OR IGNORE INTO asset_refs (asset_id, document_id) VALUES (?, ?)'
		);
		for (const { document_id } of documents) {
			const original = db
				.prepare('SELECT data FROM documents WHERE document_id = ?')
				.get(document_id);
			const payloads = original ? [JSON.parse(String(original.data))] : [];
			if (original) {
				for (const row of db
					.prepare('SELECT value FROM translations WHERE document_id = ?')
					.all(document_id))
					payloads.push(...translation_payloads(JSON.parse(String(row.value))));
			}
			const assets = collect_asset_ids(payloads);
			delete_refs.run(document_id);
			for (const asset_id of assets) insert_ref.run(asset_id, document_id);
		}
		const after = new Set(
			db
				.prepare('SELECT DISTINCT asset_id FROM asset_refs')
				.all()
				.map((row) => row.asset_id)
		);
		for (const asset_id of before) {
			if (!after.has(asset_id)) release_asset(String(asset_id));
		}
		db.exec('COMMIT');
		return documents.length;
	} catch (err) {
		db.exec('ROLLBACK');
		throw err;
	}
}
