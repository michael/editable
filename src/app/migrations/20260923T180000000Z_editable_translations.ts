export default {
	up({ db }) {
		db.exec(`
			CREATE TABLE translations (
				document_id TEXT NOT NULL,
				language TEXT NOT NULL,
				-- Sparse map: { node_id: { property_id: payload } }.
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (document_id, language)
			);
		`);
	}
};
