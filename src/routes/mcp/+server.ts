import { error } from '@sveltejs/kit';
import * as v from 'valibot';
import { toJsonSchema } from '@valibot/to-json-schema';
import { ORIGIN, VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';
import { version } from '../../../package.json' with { type: 'json' };

const protocol_version = '2026-07-28';
const legacy_protocol_version = '2025-11-25';

// Every site is its own MCP server, so clients see the site's host, not "editable".
const server_info = () => {
	const { host } = new URL(ORIGIN);
	return { name: host, title: host, version };
};

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

/** How documents are written in EDF, the XML form read_document returns and write_document and create_page take. */
const edf_rules = [
	'EDF is XML. Each node is an element named by its type with an id attribute; ids match /^[A-Za-z_][A-Za-z0-9_-]*$/ and are unique. Leave the id off new nodes to have one assigned.',
	'Properties of type string, integer, number, and boolean are attributes. read_document writes every value; keep them. On a new node you may leave an attribute out to get its default. When values is listed, use one of them.',
	'Properties of type node and node_array are child elements named after the property, containing node elements of the listed node_types (exactly one for a node property). An element includes its content in this document; a document contains all of its nodes.',
	'Properties of type text are child elements named after the property containing the text. Nodes of kind "text" hold their content directly: <paragraph id="p1">Hello</paragraph>. Text is literal: whitespace and line breaks inside a text element are stored as written, so never indent or wrap text content. Line breaks are only allowed where allow_newlines is true.',
	'Marks are inline elements named by the mark type, with an id and the mark’s properties as attributes: <strong id="s1">bold</strong>, <link id="l1" href="/about">about</link>. mark_types lists what each property allows. Marks do not nest. In a node_array, a mark such as <section id="s2"> wraps the consecutive child elements it spans.',
	'Ids are identity. Keep the id of every node and mark you keep, including when you move it or edit its text. A node or mark you add, or one that replaces another, gets no id. Never reuse an id for something else.',
	'Escape & < > as &amp; &lt; &gt; in text and attribute values.',
	'Every node has exactly one parent; to reuse content, copy it under a new id.',
	'A node property written as an attribute is a reference to another document, not content of this one. Only a page does this, for its banner, nav, and footer: <page id="about" banner="banner_1" nav="nav_1" footer="footer_1">. They are documents of their own, shared by every page: read and write them with their id, never inside a page.',
	'Image and video src values must be uploaded assets: reuse src, width, height, and mime_type from existing media, or add an image with prepare_image_upload. Videos cannot be uploaded through MCP.'
];

// Backend-only modules are imported lazily so the static deployment does not evaluate database code.
const tools = [
	define_tool({
		name: 'get_schema',
		description:
			'Describe the document model and EDF, the XML form used by read_document, write_document, and create_page: the writing rules, then every node type with its kind and properties (allowed child node_types, mark_types, string values, and defaults). Call this before using node types you have not seen in a document.',
		input: v.strictObject({}),
		annotations: { readOnlyHint: true },
		handler: async () => {
			const { document_schema } = await import('#app/document_schema.js');
			return { edf: edf_rules, node_types: document_schema };
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
		name: 'read_document',
		description:
			'Read a page or a shared document (banner, nav, or footer) as EDF (XML, see get_schema). document can be a page path (/about, or / for the home page), a full URL, a language-prefixed or old path, or a document id: a page id from list_pages, or the banner, nav, or footer id that every page references. Returns edf, the complete document, plus the version required by write_document; pages also return their current page_href. A language prefix (/de/about) or the language argument reads the translation: text and media that are not translated yet show the main language. The result lists the enabled languages; the first is the main language.',
		input: v.strictObject({
			document: v.pipe(
				v.string(),
				v.description('A page path such as /about, a full URL, or a document id such as nav_1.')
			),
			language: v.optional(
				v.pipe(
					v.string(),
					v.description('Language code such as de. Overrides the language prefix of the path.')
				)
			)
		}),
		annotations: { readOnlyHint: true },
		handler: async ({ document, language }) => {
			const { read_mcp_document } = await import('#app/server_mcp_documents.js');
			return read_mcp_document(document, language);
		}
	}),
	define_tool({
		name: 'create_page',
		description:
			'Create a new page from EDF: a <page> element with a new unique id and its content, written as described by get_schema. Leave out banner, nav, and footer; the page references the shared ones automatically. Omitted properties use their defaults, and an empty preview image is added if the page has none. The URL comes from slug if given, otherwise from the page title, with a numeric suffix when taken. The page is public at its URL right away but not linked from anywhere; to add it to the navigation, read the nav with read_document and write it back with a link. Returns page_href and the version for write_document.',
		input: v.strictObject({
			edf: v.pipe(v.string(), v.description('The page as EDF, starting with <page id="...">.')),
			slug: v.optional(
				v.pipe(
					v.string(),
					v.description('Optional URL slug, such as about-us. Defaults to the title.')
				)
			)
		}),
		annotations: { readOnlyHint: false, destructiveHint: false },
		handler: async ({ edf, slug }) => {
			const { create_mcp_page } = await import('#app/server_mcp_documents.js');
			return create_mcp_page({ edf, slug });
		}
	}),
	define_tool({
		name: 'prepare_image_upload',
		description:
			'Get instructions and a 30-minute upload token for adding new images. Image files are uploaded over HTTP, not through MCP: encode a WebP original and resized variants as described, upload them (e.g. with curl), then reference the asset in create_page or write_document. Requires a shell and network access to the site. Videos are not supported.',
		input: v.strictObject({}),
		annotations: { readOnlyHint: true },
		handler: async (_args, { grant_id }) => {
			const { prepare_image_upload } = await import('#app/server_mcp_images.js');
			return prepare_image_upload(new URL(ORIGIN).origin, grant_id);
		}
	}),
	define_tool({
		name: 'write_document',
		description:
			'Write a page or a shared document: send the complete document as EDF, as returned by read_document, with your changes applied. Nodes left out are deleted; new elements without an id get one. Include expected_version: the version from read_document, or from your previous write_document result to keep editing without reading again. The server validates the whole document and rejects stale versions or invalid changes before writing anything. A page keeps its banner, nav, and footer attributes unchanged; write those documents on their own, and remember that they appear on every page. To write a translation, pass language and the version from reading the document in that language; only text, inline formatting, and media may differ from the main language, and text equal to the main language removes its translation. Structural and layout changes belong in the main language.',
		input: v.strictObject({
			edf: v.pipe(v.string(), v.description('The complete document as EDF.')),
			expected_version: v.pipe(
				v.string(),
				v.description('The version returned by read_document or the previous write_document.')
			),
			language: v.optional(
				v.pipe(v.string(), v.description('Language code such as de to write a translation.'))
			)
		}),
		annotations: { readOnlyHint: false, destructiveHint: true },
		handler: async ({ edf, expected_version, language }) => {
			const { write_mcp_document } = await import('#app/server_mcp_documents.js');
			return write_mcp_document({ edf, expected_version, language });
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
			? { resultType: 'complete', _meta: { 'io.modelcontextprotocol/serverInfo': server_info() } }
			: {};

	switch (message.method) {
		case 'initialize':
			return {
				protocolVersion: legacy_protocol_version,
				capabilities: { tools: {} },
				serverInfo: server_info()
			};
		case 'server/discover':
			return {
				resultType: 'complete',
				_meta: { 'io.modelcontextprotocol/serverInfo': server_info() },
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
