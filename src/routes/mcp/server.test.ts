import { expect, it, vi } from 'vitest';

const metadata_url = 'https://example.com/.well-known/oauth-protected-resource/mcp';
vi.mock('$app/env/private', () => ({ ORIGIN: 'https://example.com', VERCEL: undefined }));
vi.mock('#app/server_oauth.js', () => ({
	verify_access_token: (token: string) => (token === 'secret' ? { grant_id: 'grant' } : null),
	resource_metadata_url: () => metadata_url
}));
vi.mock('#app/server_mcp_documents.js', () => ({
	read_mcp_document: (document: string) => ({ document })
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

it('requires an access token and points clients to the OAuth metadata', async () => {
	const ping = { jsonrpc: '2.0', id: 1, method: 'ping' };
	const challenge = async (authorization: string) => {
		const response = await post(ping, { authorization });
		return [response.status, response.headers.get('www-authenticate')];
	};
	expect(await challenge('')).toEqual([401, `Bearer resource_metadata="${metadata_url}"`]);
	expect(await challenge('Bearer wrong')).toEqual([
		401,
		`Bearer resource_metadata="${metadata_url}", error="invalid_token"`
	]);
	expect(await (await post(ping)).json()).toMatchObject({ result: {} });

	// The server introduces itself as the site, not as Editable.
	const init = await (await post({ jsonrpc: '2.0', id: 2, method: 'initialize' })).json();
	expect(init.result.serverInfo).toMatchObject({ name: 'example.com', title: 'example.com' });
	expect(init.result.serverInfo.version).toMatch(/^\d/);
});

it('returns structured tool results and names current arguments on invalid input', async () => {
	const ok = await (await call_tool('read_document', { document: '/about' })).json();
	expect(ok.result.structuredContent).toEqual({ document: '/about' });

	const invalid = await (await call_tool('read_document', { path: '/about' })).json();
	expect(invalid.result.isError).toBe(true);
	expect(invalid.result.content[0].text).toMatch(
		/read_document takes document, language \(optional\)\.$/
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
		error: { code: -32022, data: { supported: [modern_version, legacy_version] } }
	});
	// Without the header, clients are assumed to speak an older version.
	expect(await (await post(list, { 'mcp-protocol-version': '' })).json()).toMatchObject({
		result: { tools: expect.any(Array) }
	});
	expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
});
