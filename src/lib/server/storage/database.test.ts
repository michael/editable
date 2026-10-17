import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Document } from 'svedit';
import { sqlite_database } from './backends/sqlite_database.js';
import { file_database } from './backends/file_database.js';
import { translation_key, type Database } from './database.js';
import initial_schema from '#app/migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from '#app/migrations/20260923T180000000Z_editable_translations.js';
import oauth_schema from '#app/migrations/20261010T180000000Z_editable_mcp_oauth.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Every db must behave the same; a backend passes these to be one. */
const backends: [string, () => Database][] = [
	[
		'sqlite',
		() => {
			const sqlite = new DatabaseSync(':memory:');
			for (const migration of [initial_schema, translations_schema, oauth_schema])
				migration.up({ db: sqlite } as any);
			return sqlite_database(sqlite);
		}
	],
	[
		'files',
		() => {
			const dir = mkdtempSync(join(tmpdir(), 'editable-store-'));
			dirs.push(dir);
			return file_database({
				dir,
				serialize: (document) => JSON.stringify(document),
				parse: (text) => JSON.parse(text),
				extension: 'json'
			});
		}
	]
];

const document: Document = {
	document_id: 'p1',
	nodes: { p1: { id: 'p1', type: 'page', title: { content: 'Hi', marks: [], annotations: [] } } }
};

describe.each(backends)('%s db', (_name, open) => {
	it('keeps documents with their type and timestamps', () => {
		const db = open();
		expect(db.documents.get('p1')).toBeNull();
		const record = {
			document_id: 'p1',
			type: 'page',
			data: document,
			created_at: 'a',
			updated_at: 'a'
		};
		db.documents.put(record);
		expect(db.documents.get('p1')).toEqual(record);
		db.documents.put({ ...record, updated_at: 'b' });
		expect(db.documents.all()).toEqual([{ ...record, updated_at: 'b' }]);
		db.documents.delete('p1');
		expect(db.documents.all()).toEqual([]);
	});

	it('keeps slugs, settings, sessions, and translations by their keys', () => {
		const db = open();
		db.slugs.put({
			slug: 'about',
			document_id: 'p1',
			is_active: true,
			created_at: 'a'
		});
		db.slugs.put({ slug: 'old', document_id: 'p1', is_active: false, created_at: 'a' });
		expect(db.slugs.get('old')?.is_active).toBe(false);
		expect(
			db.slugs
				.all()
				.map((record) => record.slug)
				.sort()
		).toEqual(['about', 'old']);

		db.settings.put({ key: 'home_page_id', value: 'p1' });
		expect(db.settings.get('home_page_id')).toEqual({ key: 'home_page_id', value: 'p1' });
		expect(db.settings.all()).toEqual([{ key: 'home_page_id', value: 'p1' }]);
		expect(db.settings.get('missing')).toBeNull();

		db.sessions.put({ session_id: 's1', expires: 42 });
		expect(db.sessions.get('s1')).toEqual({ session_id: 's1', expires: 42 });
		db.sessions.delete('s1');
		expect(db.sessions.get('s1')).toBeNull();

		const key = translation_key('p1', 'de');
		const translation = { document_id: 'p1', language: 'de', value: '{}', updated_at: 'a' };
		db.translations.put(translation);
		db.translations.put({ ...translation, value: '{"x":1}' });
		expect(db.translations.get(key)?.value).toBe('{"x":1}');
		expect(db.translations.all()).toHaveLength(1);
		db.translations.delete(key);
		expect(db.translations.all()).toEqual([]);
	});

	it('keeps OAuth clients with their redirect list', () => {
		const db = open();
		const client = {
			client_id: 'c1',
			client_name: 'Claude',
			redirect_uris: ['https://claude.ai/cb'],
			created_at: 1
		};
		db.oauth_clients.put(client);
		expect(db.oauth_clients.get('c1')).toEqual(client);
		db.oauth_grants.put({
			grant_id: 'g1',
			client_id: 'c1',
			redirect_uri: client.redirect_uris[0],
			code_challenge: 'x',
			created_at: 1,
			expires_at: 2
		});
		db.oauth_tokens.put({
			token_hash: 'h1',
			grant_id: 'g1',
			kind: 'access',
			expires_at: 2
		});
		expect(db.oauth_tokens.get('h1')?.grant_id).toBe('g1');
		expect(db.oauth_grants.all()).toHaveLength(1);
	});

	it('keeps the pages each document links to, in order', () => {
		const db = open();
		db.document_refs.put({ document_id: 'nav', target_ids: ['p2', 'p1'] });
		db.document_refs.put({ document_id: 'p1', target_ids: ['p2'] });
		expect(db.document_refs.get('nav')?.target_ids).toEqual(['p2', 'p1']);
		db.document_refs.put({ document_id: 'nav', target_ids: ['p1'] });
		const by_id = (a: { document_id: string }, b: { document_id: string }) =>
			a.document_id.localeCompare(b.document_id);
		expect(db.document_refs.all().sort(by_id)).toEqual([
			{ document_id: 'nav', target_ids: ['p1'] },
			{ document_id: 'p1', target_ids: ['p2'] }
		]);
		db.document_refs.delete('p1');
		expect(db.document_refs.get('p1')).toBeNull();
	});

	it('keeps the assets each document refers to', () => {
		const db = open();
		db.asset_refs.put({ document_id: 'p1', asset_ids: ['a.webp', 'b.webp'] });
		db.asset_refs.put({ document_id: 'p2', asset_ids: ['b.webp'] });
		expect(db.asset_refs.get('p1')?.asset_ids.sort()).toEqual(['a.webp', 'b.webp']);
		db.asset_refs.put({ document_id: 'p1', asset_ids: [] });
		expect(db.asset_refs.get('p1')?.asset_ids ?? []).toEqual([]);
		expect(db.asset_refs.all().flatMap((record) => record.asset_ids)).toEqual(['b.webp']);
		db.asset_refs.delete('p2');
		expect(db.asset_refs.all().flatMap((record) => record.asset_ids)).toEqual([]);
	});
});
