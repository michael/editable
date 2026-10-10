import { expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ ORIGIN: 'https://example.com', VERCEL: undefined }));
vi.mock('#app/api.remote.js', () => ({
	get_sitemap_entries: async () => [{ path: '/über', lastmod: null }]
}));

import { GET } from './+server.js';

it('sends a sized, cacheable XML response', async () => {
	const response = await (GET as any)({});
	const body = await response.text();
	expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8');
	expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
	// Byte length, not character length: the body contains multi-byte characters.
	expect(response.headers.get('content-length')).toBe(
		String(new TextEncoder().encode(body).byteLength)
	);
	expect(body).toContain('<loc>https://example.com/%C3%BCber</loc>');
});
