import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import migration from './migrations/20261003T120000000Z_editable_code_blocks.js';
import { create_migration_helpers } from '#lib/server/migration_helpers.js';

it('migrates stored code blocks without losing content, references, or edit timestamps', () => {
	const db = new DatabaseSync(':memory:');
	try {
		db.exec(
			'CREATE TABLE documents (document_id TEXT PRIMARY KEY, type TEXT, data TEXT, updated_at TEXT)'
		);
		const content = { content: '\tconst value = 1;\n', marks: [], annotations: [] };
		const doc = {
			document_id: 'page',
			nodes: {
				page: { id: 'page', type: 'page', body: { nodes: ['old', 'new'] } },
				old: { id: 'old', type: 'preformatted', content },
				new: { id: 'new', type: 'code_block', layout: 'javascript', content }
			}
		};
		db.prepare('INSERT INTO documents VALUES (?, ?, ?, ?)').run(
			'page',
			'page',
			JSON.stringify(doc),
			'unchanged'
		);
		const context = { db, ...create_migration_helpers(db) };
		migration.up(context);
		const row = db.prepare('SELECT data, updated_at FROM documents').get() as {
			data: string;
			updated_at: string;
		};
		const updated = JSON.parse(row.data);
		expect(updated.nodes.old).toEqual({ id: 'old', type: 'code_block', content, layout: 'plain' });
		expect(updated.nodes.new).toEqual(doc.nodes.new);
		expect(updated.nodes.page).toEqual(doc.nodes.page);
		expect(row.updated_at).toBe('unchanged');
		migration.up(context);
		expect(db.prepare('SELECT data FROM documents').get()?.data).toBe(row.data);
	} finally {
		db.close();
	}
});
