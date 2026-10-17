import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const assets = vi.hoisted(() => ({
	asset_exists: vi.fn(),
	asset_size: vi.fn(),
	create_asset_read_stream: vi.fn(),
	create_variant_read_stream: vi.fn(),
	variant_path: vi.fn()
}));

vi.mock('#app/services.js', () => assets);

import { GET } from './+server.js';

const ASSET_STEM = 'a'.repeat(64);

async function get_asset(extension: string): Promise<Response> {
	const path = `${ASSET_STEM}.${extension}`;
	return GET({
		params: { path },
		request: new Request(`http://localhost/assets/${path}`)
	} as Parameters<typeof GET>[0]);
}

describe('asset response security headers', () => {
	beforeEach(() => {
		assets.asset_exists.mockReturnValue(true);
		assets.asset_size.mockResolvedValue(4);
		assets.create_asset_read_stream.mockReturnValue(Readable.from([Buffer.from('data')]));
	});

	it('does not sandbox video responses so browsers can make playback range requests', async () => {
		const response = await get_asset('mp4');

		expect(response.headers.get('Content-Type')).toBe('video/mp4');
		expect(response.headers.get('Content-Security-Policy')).toBeNull();
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
		expect(response.headers.get('Accept-Ranges')).toBe('bytes');
	});

	it('continues to sandbox directly opened images', async () => {
		const response = await get_asset('webp');

		expect(response.headers.get('Content-Type')).toBe('image/webp');
		expect(response.headers.get('Content-Security-Policy')).toBe('sandbox');
		expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
	});
});
