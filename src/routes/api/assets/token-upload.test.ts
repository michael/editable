import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { webp_bytes } from '#app/test_helpers/webp.js';
import { create_upload_token } from '#lib/server/upload_token.js';

vi.mock('$app/env/private', () => ({ MCP_API_KEY: 'secret' }));
vi.mock('#app/services.js', async () => {
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const { create_asset_storage } = await import('#lib/server/asset_storage.js');
	return create_asset_storage({
		asset_path: mkdtempSync(join(tmpdir(), 'editable-assets-')),
		asset_grace_period_days: 1,
		asset_id_regex: /^[a-f0-9]{64}\.[a-z0-9]+$/
	});
});

import { POST as upload_original } from './+server.js';
import { POST as upload_variant } from './[asset_id]/variants/+server.js';

const token = create_upload_token('secret', Date.now() + 60_000);

function request(body: Uint8Array<ArrayBuffer>, headers: Record<string, string>) {
	return new Request('http://localhost/api/assets', {
		method: 'POST',
		body,
		headers: { authorization: `Bearer ${token}`, 'content-type': 'image/webp', ...headers }
	});
}

function original(width: number, height: number, declared = { width, height }) {
	const body = webp_bytes(width, height);
	const hash = createHash('sha256').update(body).digest('hex');
	const headers = {
		'x-content-hash': hash,
		'x-asset-width': String(declared.width),
		'x-asset-height': String(declared.height)
	};
	return (upload_original as any)({ request: request(body, headers), locals: {} });
}

function variant(asset_id: string, width: number, declared_width = width) {
	const body = webp_bytes(width, Math.round(width / 2));
	return (upload_variant as any)({
		params: { asset_id },
		request: request(body, { 'x-variant-width': String(declared_width) }),
		locals: {}
	});
}

it('accepts token uploads whose WebP headers match the declared sizes', async () => {
	const { asset_id } = await (await original(1000, 500)).json();
	expect(await (await variant(asset_id, 640)).json()).toEqual({ ok: true, variant: 'w640.webp' });

	await expect(original(1200, 600, { width: 1200, height: 601 })).rejects.toMatchObject({
		status: 400,
		body: { message: expect.stringContaining('do not match the image (1200×600)') }
	});
	await expect(variant(asset_id, 320, 640)).rejects.toMatchObject({ status: 400 });
});

it('rejects uploads without an admin session or a valid token', async () => {
	const body = webp_bytes(10, 10);
	await expect(
		(upload_original as any)({ request: request(body, { authorization: '' }), locals: {} })
	).rejects.toMatchObject({ status: 401 });
	await expect(
		(upload_original as any)({
			request: request(body, { authorization: 'Bearer 1.forged' }),
			locals: {}
		})
	).rejects.toMatchObject({ status: 401, body: { message: expect.stringContaining('expired') } });
});
