import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Document } from 'svedit';
import { open_sqlite, sqlite_backend } from './sqlite_backend.js';
import { files_backend } from './files_backend.js';
import { translation_key, type Backend } from '../backend.js';
import { migrate_storage } from '#app/migrations.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-backend-'));
	dirs.push(dir);
	return dir;
}

/** Every backend must behave the same; a backend passes these to be one. */
const backends: [string, () => Backend][] = [
	[
		'sqlite',
		() => {
			const dir = temp_dir();
			return sqlite_backend({
				db: open_sqlite(join(dir, 'db.sqlite3')),
				asset_dir: join(dir, 'assets')
			});
		}
	],
	[
		'files',
		() => {
			const dir = temp_dir();
			return files_backend(
				{ db_dir: join(dir, 'db'), asset_dir: join(dir, 'assets') },
				{
					serialize: (document) => JSON.stringify(document),
					parse: (text) => JSON.parse(text),
					extension: 'json'
				}
			);
		}
	]
];

const document: Document = {
	document_id: 'p1',
	nodes: { p1: { id: 'p1', type: 'page', title: { content: 'Hi', marks: [], annotations: [] } } }
};

const text = async (stream: ReadableStream<Uint8Array> | null) =>
	stream && new Response(stream).text();

describe.each(backends)('%s backend', (_name, create) => {
	async function open() {
		const backend = create();
		await migrate_storage(backend);
		return backend;
	}

	it('keeps documents with their type and timestamps', async () => {
		const backend = await open();
		expect(await backend.documents.get('p1')).toBeNull();
		const record = {
			document_id: 'p1',
			type: 'page',
			data: document,
			created_at: 'a',
			updated_at: 'a'
		};
		await backend.documents.put(record);
		expect(await backend.documents.get('p1')).toEqual(record);
		await backend.documents.put({ ...record, updated_at: 'b' });
		expect(await backend.documents.all()).toEqual([{ ...record, updated_at: 'b' }]);
		await backend.documents.delete('p1');
		expect(await backend.documents.all()).toEqual([]);
	});

	it('keeps slugs, settings, sessions, the login throttle, and translations by their keys', async () => {
		const backend = await open();
		await backend.slugs.put({ slug: 'about', document_id: 'p1', is_active: true, created_at: 'a' });
		await backend.slugs.put({ slug: 'old', document_id: 'p1', is_active: false, created_at: 'a' });
		expect((await backend.slugs.get('old'))?.is_active).toBe(false);
		expect((await backend.slugs.all()).map((record) => record.slug).sort()).toEqual([
			'about',
			'old'
		]);

		await backend.settings.put({ key: 'home_page_id', value: 'p1' });
		expect(await backend.settings.get('home_page_id')).toEqual({
			key: 'home_page_id',
			value: 'p1'
		});
		expect(await backend.settings.get('missing')).toBeNull();

		await backend.sessions.put({ session_id: 's1', expires: 42 });
		expect(await backend.sessions.get('s1')).toEqual({ session_id: 's1', expires: 42 });
		await backend.sessions.delete('s1');
		expect(await backend.sessions.get('s1')).toBeNull();

		const throttle = { key: 'admin', failed_count: 2, locked_until: 7 };
		await backend.login_throttle.put(throttle);
		expect(await backend.login_throttle.get('admin')).toEqual(throttle);

		const key = translation_key('p1', 'de');
		const translation = { document_id: 'p1', language: 'de', value: '{}', updated_at: 'a' };
		await backend.translations.put(translation);
		await backend.translations.put({ ...translation, value: '{"x":1}' });
		expect((await backend.translations.get(key))?.value).toBe('{"x":1}');
		expect(await backend.translations.all()).toHaveLength(1);
		await backend.translations.delete(key);
		expect(await backend.translations.all()).toEqual([]);
	});

	it('keeps OAuth clients with their redirect list', async () => {
		const backend = await open();
		const client = {
			client_id: 'c1',
			client_name: 'Claude',
			redirect_uris: ['https://claude.ai/cb'],
			created_at: 1
		};
		await backend.oauth_clients.put(client);
		expect(await backend.oauth_clients.get('c1')).toEqual(client);
		await backend.oauth_grants.put({
			grant_id: 'g1',
			client_id: 'c1',
			redirect_uri: client.redirect_uris[0],
			code_challenge: 'x',
			created_at: 1,
			expires_at: 2
		});
		await backend.oauth_tokens.put({
			token_hash: 'h1',
			grant_id: 'g1',
			kind: 'access',
			expires_at: 2
		});
		expect((await backend.oauth_tokens.get('h1'))?.grant_id).toBe('g1');
		expect(await backend.oauth_grants.all()).toHaveLength(1);
	});

	it('deletes expired sessions and OAuth tokens, keeping current ones', async () => {
		const backend = await open();
		await backend.sessions.put({ session_id: 'old', expires: 10 });
		await backend.sessions.put({ session_id: 'new', expires: 30 });
		await backend.oauth_tokens.put({
			token_hash: 'old',
			grant_id: 'g',
			kind: 'access',
			expires_at: 20
		});
		await backend.oauth_tokens.put({
			token_hash: 'new',
			grant_id: 'g',
			kind: 'access',
			expires_at: 21
		});
		await backend.delete_expired(20);
		expect((await backend.sessions.all()).map((record) => record.session_id)).toEqual(['new']);
		expect((await backend.oauth_tokens.all()).map((record) => record.token_hash)).toEqual(['new']);
	});

	it('keeps the pages each document links to, in order', async () => {
		const backend = await open();
		await backend.document_refs.put({ document_id: 'nav', target_ids: ['p2', 'p1'] });
		await backend.document_refs.put({ document_id: 'p1', target_ids: ['p2'] });
		expect((await backend.document_refs.get('nav'))?.target_ids).toEqual(['p2', 'p1']);
		await backend.document_refs.put({ document_id: 'nav', target_ids: ['p1'] });
		const by_id = (a: { document_id: string }, b: { document_id: string }) =>
			a.document_id.localeCompare(b.document_id);
		expect((await backend.document_refs.all()).sort(by_id)).toEqual([
			{ document_id: 'nav', target_ids: ['p1'] },
			{ document_id: 'p1', target_ids: ['p2'] }
		]);
		await backend.document_refs.delete('p1');
		expect(await backend.document_refs.get('p1')).toBeNull();
	});

	it('keeps the assets each document refers to', async () => {
		const backend = await open();
		await backend.asset_refs.put({ document_id: 'p1', asset_ids: ['a.webp', 'b.webp'] });
		await backend.asset_refs.put({ document_id: 'p2', asset_ids: ['b.webp'] });
		expect((await backend.asset_refs.get('p1'))?.asset_ids.sort()).toEqual(['a.webp', 'b.webp']);
		await backend.asset_refs.put({ document_id: 'p1', asset_ids: [] });
		expect((await backend.asset_refs.get('p1'))?.asset_ids ?? []).toEqual([]);
		await backend.asset_refs.delete('p2');
		expect((await backend.asset_refs.all()).flatMap((record) => record.asset_ids)).toEqual([]);
	});

	it('runs transactions one at a time, and reads inside one see its writes', async () => {
		const backend = await open();
		const order: string[] = [];
		const first = backend.transaction(async (tx) => {
			await tx.settings.put({ key: 'a', value: '1' });
			order.push('first wrote');
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect((await tx.settings.get('a'))?.value).toBe('1');
			order.push('first done');
		});
		const outside = backend.settings.get('a').then((setting) => {
			order.push(`outside read ${setting?.value}`);
		});
		await Promise.all([first, outside]);
		expect(order).toEqual(['first wrote', 'first done', 'outside read 1']);

		// Work inside a transaction may also use the backend itself.
		await backend.transaction(async () => {
			await backend.settings.put({ key: 'b', value: '2' });
			expect((await backend.settings.get('b'))?.value).toBe('2');
		});

		// A transaction's tx stops working once it has ended.
		let kept: Backend | undefined;
		await backend.transaction(async (tx) => {
			kept = tx;
		});
		await expect(kept!.settings.get('a')).rejects.toThrow('ended');
	});

	it('keeps asset originals and their variants by id', async () => {
		const backend = await open();
		const bytes = new TextEncoder().encode('original');
		const written = await backend.write_asset('a.webp', bytes);
		expect(written.bytes_written).toBe(bytes.length);
		expect(written.sha256).toMatch(/^[a-f0-9]{64}$/);
		expect(await backend.asset_size('a.webp')).toBe(bytes.length);
		expect(await text(await backend.read_asset('a.webp'))).toBe('original');
		expect(await text(await backend.read_asset('a.webp', { range: { start: 1, end: 3 } }))).toBe(
			'rig'
		);

		await backend.write_asset('a.webp', new Response('small').body!, 'w640.webp');
		expect(await text(await backend.read_asset('a.webp', { variant: 'w640.webp' }))).toBe('small');
		expect(await backend.asset_size('a.webp', 'poster.webp')).toBeNull();
		expect(await backend.read_asset('missing.webp')).toBeNull();

		expect((await backend.list_assets()).map((asset) => asset.asset_id)).toEqual(['a.webp']);
		await backend.delete_asset('a.webp');
		expect(await backend.asset_size('a.webp')).toBeNull();
		expect(await backend.asset_size('a.webp', 'w640.webp')).toBeNull();
		expect(await backend.list_assets()).toEqual([]);
	});

	it('records the storage migrations it has applied', async () => {
		const backend = await open();
		expect(await backend.applied_migrations()).toContain(
			`20261017T120000000Z_editable_login_throttle_${backend.name}`
		);
	});
});

it('rolls a SQLite transaction back when it fails', async () => {
	const backend = backends[0][1]();
	await migrate_storage(backend);
	await expect(
		backend.transaction(async (tx) => {
			await tx.settings.put({ key: 'a', value: '1' });
			throw new Error('stop');
		})
	).rejects.toThrow('stop');
	expect(await backend.settings.get('a')).toBeNull();
});
