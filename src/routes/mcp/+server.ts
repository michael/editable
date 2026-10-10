import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { toJsonSchema } from '@valibot/to-json-schema';
import { ORIGIN, VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

const protocol_version = '2026-07-28';
const legacy_protocol_version = '2025-11-25';
const server_info = { name: 'editable', version: '1.0.0' };

type Protocol = 'modern' | 'legacy';

/** The approved OAuth grant the request was authorized with. */
type ToolContext = { grant_id: string };

type ToolInput = v.StrictObjectSchema<v.ObjectEntries, undefined>;

type Tool<TInput extends ToolInput = ToolInput> = {
	name: string;
	description: string;
	input: TInput;
	annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
	handler: (args: v.InferOutput<TInput>, context: ToolContext) => Promise<Record<string, unknown>>;
};

function define_tool<TInput extends ToolInput>(tool: Tool<TInput>): Tool {
	return tool as unknown as Tool;
}

const value_formats = {
	node: '{ id, type, ...properties }. Ids match /^[A-Za-z_][A-Za-z0-9_-]*$/, must be unique, and must not contain "__".',
	'property type "node"': 'The id of one child node, whose type is listed in node_types.',
	'property type "node_array"':
		'{ nodes: [child ids], marks: [], annotations: [] }. Child types must be listed in node_types.',
	'property type "text"':
		'{ content: string, marks: [range], annotations: [range] }. Mark node types must be listed in mark_types; newlines only when allow_newlines is true.',
	range:
		'{ start_offset, end_offset, node_id }. Offsets count grapheme clusters (user-perceived characters), not UTF-16 code units. node_id is a node of a mark type (kind "mark"), e.g. { id, type: "link", href } or { id, type: "strong" }. Marks in one property must not overlap.',
	'property type "string"/"integer"/"number"':
		'A plain value. When values is listed, use one of them.',
	defaults:
		'save_page fills omitted properties with their default, or with an empty string, 0, or empty text/node_array when none is listed, and fills omitted marks/annotations with []. Node properties have no default and must be set.',
	ownership:
		'Every node has exactly one owner: one node property, node_array entry, or range. To reuse content, copy the node with a new id.',
	media:
		'Image and video src values must reference uploaded assets. Reuse src, width, height, and mime_type from existing media nodes, or add a new image with prepare_image_upload. Videos cannot be uploaded through MCP.'
};

// Backend-only modules are imported lazily so the static deployment does not evaluate database code.
const tools = [
	define_tool({
		name: 'get_schema',
		description:
			'Describe the document model used by read_page and save_page: every node type with its kind and properties (allowed child node_types, mark_types, string values, and defaults), plus the JSON formats for property values. Call this before creating node types you have not seen on the page.',
		input: v.strictObject({}),
		annotations: { readOnlyHint: true },
		handler: async () => {
			const { document_schema } = await import('#app/document_schema.js');
			return { value_formats, node_types: document_schema };
		}
	}),
	define_tool({
		name: 'list_pages',
		description:
			'List site pages in the same hierarchy as Editable’s page browser. Linked pages are nested under their first parent; unlinked pages are top-level entries.',
		input: v.strictObject({}),
		annotations: { readOnlyHint: true },
		handler: async () => {
			const { build_page_browser_data } = await import('#app/page_browser_data.js');
			return build_page_browser_data('/');
		}
	}),
	define_tool({
		name: 'read_page',
		description:
			'Read an existing page. page_href can be a path (/about, or / for the home page), a full URL, a language-prefixed or old path, or a document_id from list_pages; the result contains the current page_href. Returns the complete editable document JSON, including shared banner, navigation, and footer nodes, plus the page version required by save_page. A language prefix (/de/about) or the language argument reads the translation: text and media that are not translated yet show the main language. The result lists the enabled languages; the first is the main language.',
		input: v.strictObject({
			page_href: v.pipe(
				v.string(),
				v.description('A path such as /about, a full URL, or a document_id.')
			),
			language: v.optional(
				v.pipe(
					v.string(),
					v.description('Language code such as de. Overrides the language prefix of the path.')
				)
			)
		}),
		annotations: { readOnlyHint: true },
		handler: async ({ page_href, language }) => {
			const { read_mcp_page } = await import('#app/server_mcp_pages.js');
			return read_mcp_page(page_href, language);
		}
	}),
	define_tool({
		name: 'create_page',
		description:
			'Create a new page. Send document_id (a new unique id that is also the page node id) and nodes: the page node (type "page") and all of its content nodes, in the format described by get_schema. Leave out the shared banner, navigation, and footer; the page is linked to them automatically. Omitted properties are filled with defaults, and an empty preview image is added if the page has none. The URL is derived from slug if given, otherwise from the page title, with a numeric suffix when taken. The page is public at its URL right away but not linked from anywhere; to add it to the navigation, edit the nav nodes with save_page. Returns page_href and the version for save_page.',
		input: v.strictObject({
			document: v.strictObject({
				document_id: v.string(),
				nodes: v.record(v.string(), v.record(v.string(), v.unknown()))
			}),
			slug: v.optional(
				v.pipe(
					v.string(),
					v.description('Optional URL slug, such as about-us. Defaults to the title.')
				)
			)
		}),
		annotations: { readOnlyHint: false, destructiveHint: false },
		handler: async ({ document, slug }) => {
			const { create_mcp_page } = await import('#app/server_mcp_pages.js');
			return create_mcp_page({ ...document, slug });
		}
	}),
	define_tool({
		name: 'prepare_image_upload',
		description:
			'Get instructions and a 30-minute upload token for adding new images. Image files are uploaded over HTTP, not through MCP: encode a WebP original and resized variants as described, upload them (e.g. with curl), then reference the asset in create_page or save_page. Requires a shell and network access to the site. Videos are not supported.',
		input: v.strictObject({}),
		annotations: { readOnlyHint: true },
		handler: async (_args, { grant_id }) => {
			const { prepare_image_upload } = await import('#app/server_mcp_images.js');
			return prepare_image_upload(new URL(ORIGIN).origin, grant_id);
		}
	}),
	define_tool({
		name: 'save_page',
		description:
			'Apply a partial document update using the same document JSON shape returned by read_page. Send document_id and nodes containing only node ids to create or change; every submitted node replaces the stored node with the same id. Omitted nodes are kept if still reachable. To delete, unlink a node from its parent and omit it; the server drops nodes no longer reachable from the page or shared-document roots. New or changed nodes must be linked from a parent (include the changed parent too), otherwise the save is rejected. Changes to banner, navigation, or footer nodes affect every page. Include expected_version: the version from read_page, or from your previous save_page result to keep editing without reading again. The server merges against the latest stored document, validates the complete merged graph and ownership, and rejects stale versions or invalid changes before writing. To save a translation, pass language and the version from reading the page in that language; only text, inline formatting, and media may differ from the main language, and text equal to the main language removes its translation. Structural and layout changes belong in the main language.',
		input: v.strictObject({
			document: v.strictObject({
				document_id: v.string(),
				nodes: v.record(v.string(), v.record(v.string(), v.unknown()))
			}),
			expected_version: v.pipe(
				v.string(),
				v.description('The version returned by read_page or the previous save_page.')
			),
			language: v.optional(
				v.pipe(v.string(), v.description('Language code such as de to save a translation.'))
			)
		}),
		annotations: { readOnlyHint: false, destructiveHint: true },
		handler: async ({ document, expected_version, language }) => {
			const { save_mcp_page } = await import('#app/server_mcp_pages.js');
			return save_mcp_page({ ...document, expected_version, language });
		}
	})
];

const tools_by_name = new Map(tools.map((tool) => [tool.name, tool]));

const tool_list = tools.map(({ name, description, input, annotations }) => ({
	name,
	description,
	inputSchema: toJsonSchema(input, { target: 'draft-2020-12' }),
	annotations
}));

async function call_tool(tool: Tool, args: unknown, context: ToolContext) {
	const parsed = v.safeParse(tool.input, args ?? {});
	if (!parsed.success) {
		const issues = parsed.issues.map(
			(issue) => `${v.getDotPath(issue) ?? 'arguments'}: ${issue.message}`
		);
		// Clients may keep an outdated tool description, so name the current arguments.
		const names = Object.entries(tool.input.entries).map(([name, schema]) =>
			schema.type === 'optional' ? `${name} (optional)` : name
		);
		const expected = names.length ? `takes ${names.join(', ')}` : 'takes no arguments';
		return tool_error(`Invalid arguments. ${issues.join('; ')}. ${tool.name} ${expected}.`);
	}
	try {
		const value = await tool.handler(parsed.output, context);
		return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
	} catch (err) {
		return tool_error(err instanceof Error ? err.message : String(err));
	}
}

function tool_error(message: string) {
	return { content: [{ type: 'text', text: message }], isError: true };
}

function json_response(body: unknown, status = 200): Response {
	return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function rpc_error(id: unknown, code: number, message: string, status = 400): Response {
	return json_response({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }, status);
}

/**
 * Modern requests declare the protocol version in params._meta and mirror the
 * method (and tool name) in headers. Legacy requests carry the version header,
 * except initialize, which negotiates it; without the header, the spec says to
 * assume an older version, which this stateless endpoint serves the same way.
 */
function resolve_protocol(request: Request, message: any): Protocol | Response {
	const header_version = request.headers.get('mcp-protocol-version');
	const meta_version = message.params?._meta?.['io.modelcontextprotocol/protocolVersion'];

	if (meta_version === protocol_version) {
		if (header_version !== protocol_version)
			return rpc_error(message.id, -32020, 'MCP-Protocol-Version header does not match.');
		if (request.headers.get('mcp-method') !== message.method)
			return rpc_error(message.id, -32020, 'Mcp-Method header does not match the method.');
		if (message.method === 'tools/call' && request.headers.get('mcp-name') !== message.params?.name)
			return rpc_error(message.id, -32020, 'Mcp-Name header does not match the tool name.');
		return 'modern';
	}
	if (
		message.method === 'initialize' ||
		!header_version ||
		header_version === legacy_protocol_version
	)
		return 'legacy';
	return rpc_error(
		message.id,
		-32010,
		`Unsupported protocol version. Supported versions: ${protocol_version}, ${legacy_protocol_version}.`
	);
}

async function handle_method(message: any, protocol: Protocol, context: ToolContext) {
	const modern_meta =
		protocol === 'modern'
			? { resultType: 'complete', _meta: { 'io.modelcontextprotocol/serverInfo': server_info } }
			: {};

	switch (message.method) {
		case 'initialize':
			return {
				protocolVersion: legacy_protocol_version,
				capabilities: { tools: {} },
				serverInfo: server_info
			};
		case 'server/discover':
			return {
				resultType: 'complete',
				_meta: { 'io.modelcontextprotocol/serverInfo': server_info },
				supportedVersions: [protocol_version, legacy_protocol_version],
				capabilities: { tools: {} }
			};
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: tool_list, ...modern_meta };
		case 'tools/call': {
			const tool = tools_by_name.get(message.params?.name);
			if (!tool) return rpc_error(message.id, -32602, `Unknown tool: ${message.params?.name}`);
			return { ...(await call_tool(tool, message.params.arguments, context)), ...modern_meta };
		}
		default:
			return rpc_error(message.id, -32601, `Method not found: ${message.method}`, 200);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	if (VERCEL) error(404, 'Not found');
	// Access tokens come from the OAuth flow; the 401 challenge points clients to its metadata.
	const { resource_metadata_url, verify_access_token } = await import('#app/server_oauth.js');
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	const grant = token ? verify_access_token(token) : null;
	if (!grant) {
		const invalid = token ? ', error="invalid_token"' : '';
		return new Response('Unauthorized', {
			status: 401,
			headers: {
				'WWW-Authenticate': `Bearer resource_metadata="${resource_metadata_url()}"${invalid}`,
				'Cache-Control': 'no-store'
			}
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
	// Notifications need no response and carry no state for a stateless server.
	if (message.id === undefined) {
		return new Response(null, { status: 202, headers: { 'Cache-Control': 'no-store' } });
	}

	const protocol = resolve_protocol(request, message);
	if (protocol instanceof Response) return protocol;

	const result = await handle_method(message, protocol, { grant_id: grant.grant_id });
	if (result instanceof Response) return result;
	return json_response({ jsonrpc: '2.0', id: message.id, result });
};
