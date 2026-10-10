import { expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ MCP_API_KEY: 'secret', VERCEL: undefined }));
vi.mock('#app/server_mcp_pages.js', () => ({
	read_mcp_page: (page_href: string) => ({ page_href })
}));

import { POST } from './+server.js';

const modern_version = '2026-07-28';
const legacy_version = '2025-11-25';

function post(body: object, headers: Record<string, string> = {}): Promise<Response> {
	const request = new Request('http://localhost/mcp', {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer secret',
			'mcp-protocol-version': legacy_version,
			...headers
		}
	});
	return (POST as any)({ request });
}

function call_tool(name: string, args: unknown) {
	return post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
}

it('requires the bearer token', async () => {
	const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
	expect((await post(ping, { authorization: 'Bearer wrong' })).status).toBe(401);
	expect((await post(ping, { authorization: '' })).status).toBe(401);
	expect(await (await post(ping)).json()).toMatchObject({ result: {} });
});

it('returns structured tool results and names current arguments on invalid input', async () => {
	const ok = await (await call_tool('read_page', { page_href: '/about' })).json();
	expect(ok.result.structuredContent).toEqual({ page_href: '/about' });

	const invalid = await (await call_tool('read_page', { path: '/about' })).json();
	expect(invalid.result.isError).toBe(true);
	expect(invalid.result.content[0].text).toMatch(
		/read_page takes page_href, language \(optional\)\.$/
	);
});

it('checks protocol versions and modern request headers', async () => {
	const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
	const modern_list = {
		...list,
		params: { _meta: { 'io.modelcontextprotocol/protocolVersion': modern_version } }
	};
	const modern_headers = { 'mcp-protocol-version': modern_version, 'mcp-method': 'tools/list' };

	expect(await (await post(modern_list, modern_headers)).json()).toMatchObject({
		result: { resultType: 'complete' }
	});
	expect(
		await (await post(modern_list, { ...modern_headers, 'mcp-method': 'ping' })).json()
	).toMatchObject({ error: { code: -32020 } });
	expect(await (await post(list, { 'mcp-protocol-version': '2024-01-01' })).json()).toMatchObject({
		error: { code: -32010 }
	});
	expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
});
