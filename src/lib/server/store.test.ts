import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Document } from 'svedit';
import { sqlite_store } from './sqlite_store.js';
import { file_store } from './file_store.js';
import { translation_key, type SiteStore } from './store.js';
import initial_schema from './sqlite_migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './sqlite_migrations/20260923T180000000Z_editable_translations.js';
import oauth_schema from './sqlite_migrations/20261010T180000000Z_editable_mcp_oauth.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** Every store must behave the same; a backend passes these to be one. */
const backends: [string, () => SiteStore][] = [
	[
		'sqlite',
		() => {
			const db = new DatabaseSync(':memory:');
			for (const migration of [initial_schema, translations_schema, oauth_schema])
				migration.up({ db } as any);
			return sqlite_store(db, (fn) => fn());
		}
	],
	[
		'files',
		() => {
			const dir = mkdtempSync(join(tmpdir(), 'editable-store-'));
			dirs.push(dir);
			return file_store({
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

describe.each(backends)('%s store', (_name, open) => {
	it('keeps documents with their type and timestamps', () => {
		const store = open();
		expect(store.documents.get('p1')).toBeNull();
		const record = {
			document_id: 'p1',
			type: 'page',
			data: document,
			created_at: 'a',
			updated_at: 'a'
		};
		store.documents.put('p1', record);
		expect(store.documents.get('p1')).toEqual(record);
		store.documents.put('p1', { ...record, updated_at: 'b' });
		expect(store.documents.all()).toEqual([{ ...record, updated_at: 'b' }]);
		store.documents.delete('p1');
		expect(store.documents.all()).toEqual([]);
	});

	it('keeps slugs, settings, sessions, and translations by their keys', () => {
		const store = open();
		store.slugs.put('about', {
			slug: 'about',
			document_id: 'p1',
			is_active: true,
			created_at: 'a'
		});
		store.slugs.put('old', { slug: 'old', document_id: 'p1', is_active: false, created_at: 'a' });
		expect(store.slugs.get('old')?.is_active).toBe(false);
		expect(
			store.slugs
				.all()
				.map((record) => record.slug)
				.sort()
		).toEqual(['about', 'old']);

		store.settings.put('home_page_id', { key: 'home_page_id', value: 'p1' });
		expect(store.settings.get('home_page_id')).toEqual({ key: 'home_page_id', value: 'p1' });
		expect(store.settings.all()).toEqual([{ key: 'home_page_id', value: 'p1' }]);
		expect(store.settings.get('missing')).toBeNull();

		store.sessions.put('s1', { session_id: 's1', expires: 42 });
		expect(store.sessions.get('s1')).toEqual({ session_id: 's1', expires: 42 });
		store.sessions.delete('s1');
		expect(store.sessions.get('s1')).toBeNull();

		const key = translation_key('p1', 'de');
		const translation = { document_id: 'p1', language: 'de', value: '{}', updated_at: 'a' };
		store.translations.put(key, translation);
		store.translations.put(key, { ...translation, value: '{"x":1}' });
		expect(store.translations.get(key)?.value).toBe('{"x":1}');
		expect(store.translations.all()).toHaveLength(1);
		store.translations.delete(key);
		expect(store.translations.all()).toEqual([]);
	});

	it('keeps OAuth clients with their redirect list', () => {
		const store = open();
		const client = {
			client_id: 'c1',
			client_name: 'Claude',
			redirect_uris: ['https://claude.ai/cb'],
			created_at: 1
		};
		store.oauth_clients.put('c1', client);
		expect(store.oauth_clients.get('c1')).toEqual(client);
		store.oauth_grants.put('g1', {
			grant_id: 'g1',
			client_id: 'c1',
			redirect_uri: client.redirect_uris[0],
			code_challenge: 'x',
			created_at: 1,
			expires_at: 2
		});
		store.oauth_tokens.put('h1', {
			token_hash: 'h1',
			grant_id: 'g1',
			kind: 'access',
			expires_at: 2
		});
		expect(store.oauth_tokens.get('h1')?.grant_id).toBe('g1');
		expect(store.oauth_grants.all()).toHaveLength(1);
	});

	it('keeps the pages each document links to, in order', () => {
		const store = open();
		store.document_refs.put('nav', { document_id: 'nav', target_ids: ['p2', 'p1'] });
		store.document_refs.put('p1', { document_id: 'p1', target_ids: ['p2'] });
		expect(store.document_refs.get('nav')?.target_ids).toEqual(['p2', 'p1']);
		store.document_refs.put('nav', { document_id: 'nav', target_ids: ['p1'] });
		const by_id = (a: { document_id: string }, b: { document_id: string }) =>
			a.document_id.localeCompare(b.document_id);
		expect(store.document_refs.all().sort(by_id)).toEqual([
			{ document_id: 'nav', target_ids: ['p1'] },
			{ document_id: 'p1', target_ids: ['p2'] }
		]);
		store.document_refs.delete('p1');
		expect(store.document_refs.get('p1')).toBeNull();
	});

	it('keeps the assets each document refers to', () => {
		const store = open();
		store.asset_refs.put('p1', { document_id: 'p1', asset_ids: ['a.webp', 'b.webp'] });
		store.asset_refs.put('p2', { document_id: 'p2', asset_ids: ['b.webp'] });
		expect(store.asset_refs.get('p1')?.asset_ids.sort()).toEqual(['a.webp', 'b.webp']);
		store.asset_refs.put('p1', { document_id: 'p1', asset_ids: [] });
		expect(store.asset_refs.get('p1')?.asset_ids ?? []).toEqual([]);
		expect(store.asset_refs.all().flatMap((record) => record.asset_ids)).toEqual(['b.webp']);
		store.asset_refs.delete('p2');
		expect(store.asset_refs.all().flatMap((record) => record.asset_ids)).toEqual([]);
	});
});
