import { createHash, timingSafeEqual } from 'node:crypto';
import { MCP_API_KEY } from '$app/env/private';
import type { RequestHandler } from './$types';

const protocol_version = '2026-07-28';
const legacy_protocol_version = '2025-11-25';
const server_info = { name: 'editable-hello', version: '1.0.0' };
const mcp_tools = [
	{
		name: 'hello_world',
		description: 'Return a friendly greeting to verify the Editable MCP connection.',
		inputSchema: {
			type: 'object',
			properties: { name: { type: 'string', description: 'Who to greet.' } },
			additionalProperties: false
		}
	},
	{
		name: 'list_pages',
		description:
			'List site pages in the same hierarchy as Editable’s page browser. Includes linked pages nested under their first parent and unlinked pages as top-level entries. This tool is read-only.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false }
	}
];

async function get_page_browser_tree() {
	// Keep backend-only modules lazy so the static deployment does not evaluate database code.
	const { build_page_browser_data } = await import('#app/page_browser_data.js');
	return build_page_browser_data('/');
}

function json_response(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: { 'Cache-Control': 'no-store' }
	});
}

function rpc_error(id: unknown, code: number, message: string, status = 400): Response {
	return json_response({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);
}

function has_valid_bearer_token(request: Request): boolean {
	if (!MCP_API_KEY) return false;
	const authorization = request.headers.get('authorization') ?? '';
	const match = /^Bearer ([^\s]+)$/i.exec(authorization);
	if (!match) return false;
	const expected_hash = createHash('sha256').update(MCP_API_KEY).digest();
	const actual_hash = createHash('sha256').update(match[1]).digest();
	return timingSafeEqual(expected_hash, actual_hash);
}

export const POST: RequestHandler = async ({ request }) => {
	if (!MCP_API_KEY) {
		return json_response(
			{ error: 'The MCP endpoint is not configured. Set MCP_API_KEY on the server.' },
			503
		);
	}
	if (!has_valid_bearer_token(request)) {
		return new Response('Unauthorized', {
			status: 401,
			headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' }
		});
	}
	if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
		return json_response({ error: 'Content-Type must be application/json.' }, 415);
	}

	let message: any;
	try {
		message = await request.json();
	} catch {
		return rpc_error(null, -32700, 'Parse error.');
	}
	if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
		return rpc_error(message?.id, -32600, 'Invalid JSON-RPC request.');
	}

	const meta = message.params?._meta;
	const request_version = meta?.['io.modelcontextprotocol/protocolVersion'];
	const is_modern = request_version === protocol_version;
	const is_legacy_init = message.method === 'initialize';
	const is_legacy =
		is_legacy_init ||
		request_version === legacy_protocol_version ||
		request.headers.get('mcp-protocol-version') === legacy_protocol_version ||
		message.method === 'notifications/initialized';
	if (!is_modern && !is_legacy && message.method !== 'notifications/initialized') {
		return rpc_error(
			message.id,
			-32010,
			`Unsupported protocol version. Supported versions: ${protocol_version}, ${legacy_protocol_version}.`
		);
	}
	if (is_modern) {
		if (request.headers.get('mcp-protocol-version') !== protocol_version) {
			return rpc_error(
				message.id,
				-32020,
				'MCP-Protocol-Version header does not match the supported protocol version.'
			);
		}
		if (request.headers.get('mcp-method') !== message.method) {
			return rpc_error(message.id, -32020, 'Mcp-Method header does not match the JSON-RPC method.');
		}
		const expected_name = message.method === 'tools/call' ? message.params?.name : undefined;
		if (expected_name && request.headers.get('mcp-name') !== expected_name) {
			return rpc_error(message.id, -32020, 'Mcp-Name header does not match the tool name.');
		}
	} else if (
		!is_legacy_init &&
		message.method !== 'notifications/initialized' &&
		request.headers.get('mcp-protocol-version') !== legacy_protocol_version
	) {
		return rpc_error(message.id, -32600, 'MCP-Protocol-Version header is missing or invalid.');
	}
	if (message.id === undefined)
		return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });

	let result: Record<string, unknown>;
	switch (message.method) {
		case 'initialize':
			result = {
				protocolVersion: legacy_protocol_version,
				capabilities: { tools: {} },
				serverInfo: server_info
			};
			break;
		case 'notifications/initialized':
		case 'ping':
			result = {};
			break;
		case 'server/discover':
			result = {
				resultType: 'complete',
				supportedVersions: [protocol_version, legacy_protocol_version],
				capabilities: { tools: {} },
				_meta: { 'io.modelcontextprotocol/serverInfo': server_info }
			};
			break;
		case 'tools/list':
			result = {
				tools: mcp_tools,
				...(is_modern
					? {
							resultType: 'complete',
							_meta: { 'io.modelcontextprotocol/serverInfo': server_info }
						}
					: {})
			};
			break;
		case 'tools/call': {
			if (message.params?.name === 'list_pages') {
				const page_tree = await get_page_browser_tree();
				result = {
					content: [{ type: 'text', text: JSON.stringify(page_tree, null, 2) }],
					...(is_modern
						? {
								resultType: 'complete',
								_meta: { 'io.modelcontextprotocol/serverInfo': server_info }
							}
						: {})
				};
				break;
			}
			if (message.params?.name !== 'hello_world') {
				return rpc_error(message.id, -32602, `Unknown tool: ${message.params?.name ?? ''}`);
			}
			const name =
				typeof message.params?.arguments?.name === 'string'
					? message.params.arguments.name.trim() || 'world'
					: 'world';
			result = {
				content: [{ type: 'text', text: `Hello, ${name}! The Editable MCP connection works.` }],
				...(is_modern
					? {
							resultType: 'complete',
							_meta: { 'io.modelcontextprotocol/serverInfo': server_info }
						}
					: {})
			};
			break;
		}
		default:
			return rpc_error(message.id, -32601, `Method not found: ${message.method}`, 200);
	}

	return json_response({ jsonrpc: '2.0', id: message.id, result });
};
