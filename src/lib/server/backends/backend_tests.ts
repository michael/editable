import { describe, expect, it } from 'vitest';
import type { Document } from 'svedit';
import { ConflictError, type Backend, type NewDocument } from '../backend.js';

const page = (document_id: string, title = 'Hi'): Document => ({
	document_id,
	nodes: {
		[document_id]: {
			id: document_id,
			type: 'page',
			title: { content: title, marks: [], annotations: [] }
		}
	}
});

const record = (document_id: string, title?: string): NewDocument => ({
	document_id,
	type: 'page',
	data: page(document_id, title),
	created_at: 'a',
	updated_at: 'a'
});

const text = async (stream: ReadableStream<Uint8Array> | null) =>
	stream && new Response(stream).text();

/**
 * What every backend must do. Call it from a test file of your own with a
 * function that returns a new backend with its storage migrations applied:
 * Editable's releases add to these tests, and they then apply to your backend.
 */
export function test_backend(name: string, create: () => Promise<Backend>) {
	describe(`${name} backend`, () => {
		it('saves documents, gives each write a new version, and refuses stale saves', async () => {
			const backend = await create();
			expect(await backend.get_document('p1')).toBeNull();
			await backend.save_documents({ expect: { p1: null }, documents: [record('p1')] });
			const saved = (await backend.get_document('p1'))!;
			expect(saved).toMatchObject(record('p1'));
			expect(saved.version).toBeTruthy();

			await expect(
				backend.save_documents({ expect: { p1: null }, documents: [record('p1', 'Again')] })
			).rejects.toThrow(ConflictError);
			await backend.save_documents({
				expect: { p1: saved.version },
				documents: [record('p1', 'Second')]
			});
			const second = (await backend.get_document('p1'))!;
			expect(second.version).not.toBe(saved.version);
			// A stale save writes nothing, not even what came with it.
			await expect(
				backend.save_documents({
					expect: { p1: saved.version },
					documents: [record('p1', 'Lost')],
					settings: [{ key: 'home_page_id', value: 'p1' }]
				})
			).rejects.toThrow(ConflictError);
			expect((await backend.get_document('p1'))!.data.nodes.p1.title.content).toBe('Second');
			expect(await backend.get_setting('home_page_id')).toBeNull();
		});

		it('saves what changes with documents, and lists documents by type', async () => {
			const backend = await create();
			await backend.save_documents({
				documents: [record('p1'), { ...record('n1'), type: 'nav' }],
				document_refs: [{ document_id: 'n1', target_ids: ['p2', 'p1'] }],
				asset_refs: [{ document_id: 'p1', asset_ids: ['a.webp', 'b.webp'] }],
				translations: {
					put: [{ document_id: 'p1', language: 'de', value: '{}', updated_at: 'a' }]
				},
				slugs: [{ slug: 'about', document_id: 'p1', is_active: true, created_at: 'a' }],
				settings: [{ key: 'home_page_id', value: 'p1' }]
			});
			expect((await backend.list_documents()).map((r) => r.document_id)).toEqual(['n1', 'p1']);
			expect((await backend.list_documents('page')).map((r) => r.document_id)).toEqual(['p1']);
			expect(await backend.list_document_refs()).toEqual([
				{ document_id: 'n1', target_ids: ['p2', 'p1'] }
			]);
			expect((await backend.list_asset_refs())[0].asset_ids.sort()).toEqual(['a.webp', 'b.webp']);
			expect((await backend.list_translations())[0]).toMatchObject({
				document_id: 'p1',
				language: 'de'
			});
			expect(await backend.get_setting('home_page_id')).toBe('p1');
			expect(await backend.list_settings()).toEqual([{ key: 'home_page_id', value: 'p1' }]);

			// References are replaced, not added to.
			await backend.save_documents({
				document_refs: [{ document_id: 'n1', target_ids: ['p1'] }],
				asset_refs: [{ document_id: 'p1', asset_ids: [] }],
				translations: { delete: [{ document_id: 'p1', language: 'de' }] }
			});
			expect(await backend.list_document_refs()).toEqual([
				{ document_id: 'n1', target_ids: ['p1'] }
			]);
			expect((await backend.list_asset_refs()).flatMap((r) => r.asset_ids)).toEqual([]);
			expect(await backend.list_translations()).toEqual([]);
		});

		it('resolves slugs to their page and its active slug', async () => {
			const backend = await create();
			await backend.save_documents({
				documents: [record('p1')],
				slugs: [{ slug: 'old', document_id: 'p1', is_active: true, created_at: 'a' }]
			});
			// Renaming: the old slug stays as a redirect.
			await backend.save_documents({
				slugs: [
					{ slug: 'old', document_id: 'p1', is_active: false, created_at: 'a' },
					{ slug: 'new', document_id: 'p1', is_active: true, created_at: 'b' }
				]
			});
			expect(await backend.resolve_slug('old')).toEqual({
				document_id: 'p1',
				is_active: false,
				active_slug: 'new'
			});
			expect(await backend.resolve_slug('new')).toMatchObject({ is_active: true });
			expect(await backend.resolve_slug('missing')).toBeNull();
			expect(await backend.get_active_slug('p1')).toBe('new');
			expect((await backend.list_slugs()).map((r) => r.slug).sort()).toEqual(['new', 'old']);
		});

		it('deletes a page with everything attached to it', async () => {
			const backend = await create();
			await backend.save_documents({
				documents: [record('p1'), record('p2')],
				slugs: [{ slug: 'one', document_id: 'p1', is_active: true, created_at: 'a' }],
				translations: {
					put: [{ document_id: 'p1', language: 'de', value: '{}', updated_at: 'a' }]
				},
				document_refs: [
					{ document_id: 'p1', target_ids: ['p2'] },
					{ document_id: 'p2', target_ids: ['p1', 'p3'] }
				],
				asset_refs: [{ document_id: 'p1', asset_ids: ['a.webp'] }]
			});
			await backend.delete_page('p1');
			expect(await backend.get_document('p1')).toBeNull();
			expect(await backend.resolve_slug('one')).toBeNull();
			expect(await backend.list_translations()).toEqual([]);
			expect(await backend.list_asset_refs()).toEqual([]);
			expect(await backend.list_document_refs()).toEqual([
				{ document_id: 'p2', target_ids: ['p3'] }
			]);
		});

		it('saves translations against the versions they were made from', async () => {
			const backend = await create();
			await backend.save_documents({ documents: [record('p1')] });
			const document = (await backend.get_document('p1'))!;
			const save = (version: string | null, value: string) =>
				backend.save_translations({
					expect: {
						documents: { p1: document.version },
						translations: [{ document_id: 'p1', language: 'de', version }]
					},
					put: [{ document_id: 'p1', language: 'de', value, updated_at: 'a' }],
					delete: [],
					asset_refs: [{ document_id: 'p1', asset_ids: ['de.webp'] }]
				});
			await save(null, '{"a":1}');
			const [translation] = await backend.list_translations({
				document_ids: ['p1'],
				language: 'de'
			});
			expect(translation).toMatchObject({ value: '{"a":1}' });
			await expect(save(null, '{"a":2}')).rejects.toThrow(ConflictError);
			await save(translation.version, '{"a":3}');
			expect((await backend.list_translations({ language: 'de' }))[0].value).toBe('{"a":3}');
			expect(await backend.list_translations({ language: 'fr' })).toEqual([]);
			expect((await backend.list_asset_refs())[0].asset_ids).toEqual(['de.webp']);
		});

		it('keeps sessions and the login throttle, and expires sessions and tokens', async () => {
			const backend = await create();
			await backend.save_session({ session_id: 's1', expires: 10 });
			await backend.save_session({ session_id: 's2', expires: 30 });
			expect(await backend.get_session('s1')).toEqual({ session_id: 's1', expires: 10 });
			await backend.save_login_throttle({ key: 'admin', failed_count: 2, locked_until: 7 });
			expect(await backend.get_login_throttle('admin')).toEqual({
				key: 'admin',
				failed_count: 2,
				locked_until: 7
			});
			await backend.save_oauth_token({
				token_hash: 'old',
				grant_id: 'g',
				kind: 'access',
				expires_at: 20
			});
			await backend.save_oauth_token({
				token_hash: 'new',
				grant_id: 'g',
				kind: 'access',
				expires_at: 21
			});
			await backend.delete_expired(20);
			expect(await backend.get_session('s1')).toBeNull();
			expect(await backend.get_session('s2')).not.toBeNull();
			expect(await backend.get_oauth_token('old')).toBeNull();
			expect(await backend.get_oauth_token('new')).not.toBeNull();
			await backend.delete_session('s2');
			expect(await backend.get_session('s2')).toBeNull();
		});

		it('keeps OAuth clients and grants, redeems a token once, and revokes grants', async () => {
			const backend = await create();
			const client = {
				client_id: 'c1',
				client_name: 'Claude',
				redirect_uris: ['https://claude.ai/cb'],
				created_at: 1
			};
			await backend.save_oauth_client(client);
			expect(await backend.get_oauth_client('c1')).toEqual(client);
			expect(await backend.list_oauth_clients()).toEqual([client]);
			const grant = {
				grant_id: 'g1',
				client_id: 'c1',
				redirect_uri: client.redirect_uris[0],
				code_challenge: 'x',
				created_at: 1,
				expires_at: 100
			};
			await backend.save_oauth_grant(grant);
			expect(await backend.get_oauth_grant('g1')).toEqual(grant);
			const token = { token_hash: 'h1', grant_id: 'g1', kind: 'code', expires_at: 50 };
			await backend.save_oauth_token(token);
			expect(await backend.take_oauth_token('h1')).toEqual(token);
			expect(await backend.take_oauth_token('h1')).toBeNull();

			await backend.save_oauth_token({ ...token, token_hash: 'h2' });
			await backend.revoke_oauth_grants(40);
			expect(await backend.get_oauth_token('h2')).toBeNull();
			expect((await backend.get_oauth_grant('g1'))!.expires_at).toBe(40);
			await backend.delete_oauth_grant('g1');
			await backend.delete_oauth_client('c1');
			expect(await backend.list_oauth_grants()).toEqual([]);
			expect(await backend.list_oauth_clients()).toEqual([]);
		});

		it('keeps asset originals and their variants by id', async () => {
			const backend = await create();
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
			expect(await text(await backend.read_asset('a.webp', { variant: 'w640.webp' }))).toBe(
				'small'
			);
			expect(await backend.asset_size('a.webp', 'poster.webp')).toBeNull();
			expect(await backend.read_asset('missing.webp')).toBeNull();
			expect((await backend.list_assets()).map((asset) => asset.asset_id)).toEqual(['a.webp']);
			await backend.delete_asset('a.webp');
			expect(await backend.asset_size('a.webp')).toBeNull();
			expect(await backend.asset_size('a.webp', 'w640.webp')).toBeNull();
		});

		it('records a storage migration only when it succeeds', async () => {
			const backend = await create();
			await expect(
				backend.run_migration('29990101T000000000Z_test_fails', () => {
					throw new Error('no');
				})
			).rejects.toThrow('no');
			let received: unknown;
			await backend.run_migration('29990101T000000000Z_test_works', (storage) => {
				received = storage;
			});
			expect(received).toBe(backend.storage);
			const applied = await backend.applied_migrations();
			expect(applied).toContain('29990101T000000000Z_test_works');
			expect(applied).not.toContain('29990101T000000000Z_test_fails');
		});
	});
}
