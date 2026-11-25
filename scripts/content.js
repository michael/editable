// Read and write this site's content from the command line, as the MCP server
// does, but straight against the local data: no dev server, port, or sign-in.
// It loads the MCP code through Vite, so every write is validated the same way.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';

const usage = `Usage: pnpm content <command>

  schema                                 EDF rules and every node type, as JSON
  pages                                  the page tree, as JSON
  read <document> [file]                 a document as EDF, to file or stdout; prints its version
  write <file> --version <version>       write a document read with read
  create <file> [--slug <slug>]          create a page from EDF
  image <original.webp> <variant.webp>... [--alt <text>]
                                         add an image and print its <image/> element
  image <file.svg> --width <w> --height <h> [--alt <text>]

<document> is a page path such as / or /about, or a document id such as nav_1.
read and write take --language <code> for a translation.

Encode images like the editor: a WebP original at quality 80, at most 4096px
wide, and a WebP variant of it for every width in 320, 640, 1024, 1536, 2048,
and 3072 that is smaller than the original. image checks them before storing.`;

const { values: options, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		version: { type: 'string' },
		slug: { type: 'string' },
		alt: { type: 'string', default: '' },
		width: { type: 'string' },
		height: { type: 'string' },
		language: { type: 'string' },
		help: { type: 'boolean', short: 'h' }
	}
});
const [command, ...args] = positionals;
const commands = { schema, pages, read, write, create, image };
if (options.help || !Object.hasOwn(commands, command)) {
	console.error(usage);
	process.exit(options.help ? 0 : 2);
}

const vite = await createServer({
	server: { middlewareMode: true, hmr: false, ws: false },
	appType: 'custom',
	logLevel: 'error'
});
const load = (path) => vite.ssrLoadModule(path);
try {
	await commands[command](...args);
} catch (err) {
	console.error(err instanceof Error ? err.message : err);
	process.exitCode = 1;
} finally {
	await vite.close();
}

function print_json(value) {
	console.log(JSON.stringify(value, null, '\t'));
}

/** Print a write result without the EDF it was given. */
function print_result({ edf: _edf, ...result }) {
	print_json(result);
}

async function schema() {
	const { edf_rules } = await load('/src/app/server_mcp_documents.ts');
	const { document_schema } = await load('/src/app/document_schema.ts');
	print_json({ edf: edf_rules, node_types: document_schema });
}

async function pages() {
	const { build_page_browser_data } = await load('/src/app/page_browser_data.ts');
	print_json(await build_page_browser_data('/'));
}

async function read(document, file) {
	if (!document) throw new Error('read takes a page path or document id.');
	const { read_mcp_document } = await load('/src/app/server_mcp_documents.ts');
	const { edf, ...result } = await read_mcp_document(document, options.language);
	if (file) await writeFile(file, edf + '\n');
	else console.log(edf);
	console.error(JSON.stringify(result));
}

async function write(file) {
	if (!file || !options.version) throw new Error('write takes a file and --version.');
	const { write_mcp_document } = await load('/src/app/server_mcp_documents.ts');
	const edf = await readFile(file, 'utf8');
	print_result(
		await write_mcp_document({ edf, expected_version: options.version, language: options.language })
	);
}

async function create(file) {
	if (!file) throw new Error('create takes a file.');
	const { create_mcp_page } = await load('/src/app/server_mcp_documents.ts');
	const edf = await readFile(file, 'utf8');
	print_result(await create_mcp_page({ edf, slug: options.slug }));
}

/**
 * Store an image the agent encoded, as the editor would have: a WebP original
 * at most MAX_IMAGE_WIDTH wide with a variant for every smaller VARIANT_WIDTHS
 * width, or an SVG as it is. The asset id is the original's SHA-256.
 */
async function image(file, ...variant_files) {
	if (!file) throw new Error('image takes a file.');
	const { backend } = await load('/src/app/services.ts');
	const { MAX_IMAGE_WIDTH, VARIANT_WIDTHS } = await load('/src/app/config.ts');
	const { webp_dimensions } = await load('/src/lib/server/webp.ts');
	const original = await readFile(file);

	if (extname(file).toLowerCase() === '.svg') {
		const width = Number(options.width);
		const height = Number(options.height);
		if (!width || !height) throw new Error('An SVG takes --width and --height.');
		const asset_id = `${sha256(original)}.svg`;
		await backend.write_asset(asset_id, original);
		return print_image(asset_id, 'image/svg+xml', width, height);
	}

	const size = webp_dimensions(original);
	if (!size) throw new Error(`${file} is not a WebP file.`);
	if (size.width > MAX_IMAGE_WIDTH)
		throw new Error(
			`The original is ${size.width}px wide; scale it to at most ${MAX_IMAGE_WIDTH}px.`
		);
	const variants = new Map();
	for (const variant_file of variant_files) {
		const bytes = await readFile(variant_file);
		const width = webp_dimensions(bytes)?.width;
		if (!width) throw new Error(`${variant_file} is not a WebP file.`);
		if (!VARIANT_WIDTHS.includes(width) || width >= size.width)
			throw new Error(`${variant_file} is ${width}px wide, which is not a variant width.`);
		variants.set(width, bytes);
	}
	const missing = VARIANT_WIDTHS.filter((width) => width < size.width && !variants.has(width));
	if (missing.length) throw new Error(`Variants missing for widths ${missing.join(', ')}.`);

	const asset_id = `${sha256(original)}.webp`;
	await backend.write_asset(asset_id, original);
	for (const [width, bytes] of variants)
		await backend.write_asset(asset_id, bytes, `w${width}.webp`);
	print_image(asset_id, 'image/webp', size.width, size.height);
}

function sha256(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function print_image(asset_id, mime_type, width, height) {
	const alt = options.alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
	console.log(
		`<image src="${asset_id}" mime_type="${mime_type}" width="${width}" height="${height}" alt="${alt}"/>`
	);
}
