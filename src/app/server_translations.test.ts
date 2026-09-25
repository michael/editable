import { afterAll, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';

vi.mock('$app/env/private', () => ({
	LANGUAGES: 'en,de',
	ORIGIN: 'https://example.com',
	VERCEL: undefined
}));
vi.mock('./services.js', async () => {
	const { DatabaseSync } = await import('node:sqlite');
	const db = new DatabaseSync(':memory:');
	return {
		db,
		with_transaction: (callback: () => unknown) => {
			db.exec('BEGIN');
			try {
				const result = callback();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		}
	};
});

import { db } from './services.js';
import migration from './migrations/20260923T180000000Z_editable_translations.js';
import {
	default_page_document,
	default_nav_document,
	default_footer_document
} from './default_site.js';
import { save_translated_document, translated_document } from './server_translations.js';
import { text_properties } from './translations.js';

afterAll(() => (db as DatabaseSync).close());

it('saves sparse page/shared translations, protects originals, rejects stale and structural saves, and resets equal text', () => {
	db.exec('CREATE TABLE documents (document_id TEXT PRIMARY KEY, data TEXT)');
	migration.up({ db });
	for (const doc of [default_page_document, default_nav_document, default_footer_document]) {
		db.prepare('INSERT INTO documents VALUES (?, ?)').run(doc.document_id, JSON.stringify(doc));
	}
	const originals = db.prepare('SELECT * FROM documents ORDER BY document_id').all();
	const id = default_page_document.document_id;
	const loaded = translated_document(id, 'de');
	const input = {
		...loaded.document,
		language: 'de',
		translation_revision: loaded.translation_revision
	};
	// Saving fallback text alone must not create any rows.
	save_translated_document(input);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
	input.nodes[id].title.content = 'Deutscher Titel';
	const footer_property = text_properties(default_footer_document)[0];
	input.nodes[footer_property.node_id][footer_property.property_id].content = 'Deutsche Fußzeile';
	save_translated_document(input);
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(2);
	const stored = db
		.prepare('SELECT value FROM translations WHERE node_id = ? AND property_id = ?')
		.get(id, 'title') as { value: string };
	expect(JSON.parse(stored.value)).toEqual({
		content: 'Deutscher Titel',
		marks: [],
		annotations: [],
		nodes: {}
	});
	expect(
		db
			.prepare('SELECT * FROM translations WHERE document_id = ?')
			.all(default_footer_document.document_id)
	).toHaveLength(1);
	expect(db.prepare('SELECT * FROM documents ORDER BY document_id').all()).toEqual(originals);
	expect(() => save_translated_document(input)).toThrow();
	const translated = translated_document(id, 'de');
	expect(translated.document.nodes[id].title.content).toBe('Deutscher Titel');
	const original = translated_document(id, 'en');
	const invalid = structuredClone(translated.document);
	invalid.nodes[id].body.nodes = [];
	expect(() =>
		save_translated_document({
			...invalid,
			language: 'de',
			translation_revision: translated.translation_revision
		})
	).toThrow();
	save_translated_document({
		...original.document,
		language: 'de',
		translation_revision: translated.translation_revision
	});
	expect(db.prepare('SELECT * FROM translations').all()).toHaveLength(0);
});
