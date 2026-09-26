/** Read original and translated assets, including backups made before translations existed. */
export function referenced_assets(db) {
	const rows = db.prepare('SELECT data FROM documents').all();
	if (
		db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'translations'").get()
	) {
		rows.push(...db.prepare('SELECT value AS data FROM translations').all());
	}
	const referenced = new Set();
	for (const row of rows) {
		const payload = JSON.parse(row.data);
		for (const node of Object.values(payload.nodes ?? {})) {
			if (
				(node.type === 'image' || node.type === 'video') &&
				typeof node.src === 'string' &&
				node.src &&
				!node.src.startsWith('blob:')
			)
				referenced.add(node.src);
		}
	}
	return referenced;
}
