export default {
	up({ db }) {
		db.exec(`
			CREATE TABLE translations (
				document_id TEXT NOT NULL,
				language TEXT NOT NULL,
				node_id TEXT NOT NULL,
				property_id TEXT NOT NULL,
				-- Text payload JSON: { content, marks, annotations, nodes }.
				value TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				PRIMARY KEY (document_id, language, node_id, property_id)
			);
		`);
	}
};
