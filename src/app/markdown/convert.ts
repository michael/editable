// Markdown to Editable document conversion.
//
// Converts a markdown file into a page document graph matching
// `document_schema`. The result contains the `page` root plus all content
// nodes, but no nav/footer — those are merged in by `compose.js`.
//
// Unsupported constructs are rejected with a source-located error instead of
// being silently dropped or degraded.

import { normalize_code_language } from '#app/code_languages.js';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { MEDIA_DEFAULTS } from '#app/document_schema.js';
import { document_schema } from '#app/document_schema.js';
import { select_toc_headings } from '#lib/server/markdown/toc.js';
import type { TocHeading } from '#lib/server/markdown/toc.js';
import type { Document, DocumentNode } from 'svedit';

const SAFE_LINK_SCHEMES = new Set(['http', 'https', 'mailto']);

/** Shared conversion state threaded through the converter functions. */
type Ctx = {
	source: string;
	doc_id: string;
	counter: number;
	nodes: Record<string, DocumentNode>;
	used_ids: Set<string>;
};

/**
 * Whether the schema allows newlines in a node type's content property.
 */
function content_allows_newlines(node_type: string): boolean {
	return document_schema[node_type]?.properties?.content?.allow_newlines === true;
}

/**
 * Whether an html node consists only of comments (which render as nothing in
 * every markdown renderer, so skipping them drops no visible content).
 */
function is_html_comment(value: string): boolean {
	return value.replace(/<!--[\s\S]*?-->/g, '').trim() === '';
}

export class MarkdownConversionError extends Error {
	source: string | undefined;
	position: any;

	constructor(message: string, { source, position }: { source?: string; position?: any } = {}) {
		const location = position?.start
			? `${source ?? 'markdown'}:${position.start.line}:${position.start.column}`
			: (source ?? 'markdown');
		super(`${location} — ${message}`);
		this.name = 'MarkdownConversionError';
		this.source = source;
		this.position = position ?? null;
	}
}

/**
 * Convert markdown text to a page document graph (without nav/footer).
 * Throws MarkdownConversionError on unsupported constructs.
 */
export function convert_markdown(
	markdown_text: string,
	mapping: { source: string; pathname: string; toc?: boolean }
): Document {
	const { source, pathname, toc = false } = mapping;
	const tree = fromMarkdown(markdown_text);

	const ctx: Ctx = {
		source,
		doc_id: `md_${pathname.slice(1).replaceAll('-', '_')}`,
		counter: 0,
		nodes: {},
		used_ids: new Set()
	};

	const body_ids: string[] = [];
	let prose_items: string[] | null = null;
	const headings: TocHeading[] = [];
	// Headings whose section has not yet seen a paragraph — the first paragraph
	// becomes their subtitle, used as the toc description.
	let pending_subtitle_headings: { subtitle: string }[] = [];
	// Body indexes where a Markdown level-2 heading starts a new section.
	const section_boundaries: number[] = [];
	// Prose body array -> prose node id
	const prose_ids_by_container = new Map<string[], string>();

	function flush_prose() {
		if (!prose_items || prose_items.length === 0) {
			prose_items = null;
			return;
		}
		const prose_id = next_id(ctx);
		ctx.nodes[prose_id] = {
			id: prose_id,
			type: 'prose',
			layout: 'narrow-left',
			body: { nodes: prose_items, marks: [], annotations: [] }
		};
		prose_ids_by_container.set(prose_items, prose_id);
		body_ids.push(prose_id);
		prose_items = null;
	}

	function push_prose_item(node_id: string) {
		if (!prose_items) prose_items = [];
		prose_items.push(node_id);
	}

	for (const [index, block] of tree.children.entries()) {
		switch (block.type) {
			case 'paragraph': {
				const id = next_id(ctx);
				ctx.nodes[id] = {
					id,
					type: 'paragraph',
					layout: 'regular',
					content: convert_inline(ctx, block.children, {
						allow_newlines: content_allows_newlines('paragraph')
					})
				};
				push_prose_item(id);
				for (const heading of pending_subtitle_headings) {
					heading.subtitle = ctx.nodes[id].content.content;
				}
				pending_subtitle_headings = [];
				break;
			}
			case 'heading': {
				if (block.depth > 4) {
					throw new MarkdownConversionError(
						`Heading level ${block.depth} is not supported (the schema defines heading_1 through heading_4).`,
						{ source, position: block.position }
					);
				}
				const heading_type = `heading_${block.depth}`;
				const id = heading_id(ctx, block);
				ctx.nodes[id] = {
					id,
					type: heading_type,
					layout: 'regular',
					content: convert_inline(ctx, block.children, {
						allow_newlines: content_allows_newlines(heading_type)
					})
				};
				// Markdown level-2 headings start a new visual section: close the current
				// prose run and remember where the section begins in the body.
				if (block.depth === 2) {
					flush_prose();
					section_boundaries.push(body_ids.length);
				}
				push_prose_item(id);
				if (!prose_items) throw new Error('unreachable');
				const heading_record = { id, depth: block.depth, container: prose_items, subtitle: '' };
				headings.push(heading_record);
				pending_subtitle_headings.push(heading_record);
				break;
			}
			case 'list': {
				const listing_id = convert_descriptive_listing(ctx, block);
				if (listing_id) {
					flush_prose();
					body_ids.push(listing_id);
				} else {
					push_prose_item(convert_list(ctx, block));
				}
				break;
			}
			case 'code': {
				flush_prose();
				const id = next_id(ctx);
				ctx.nodes[id] = {
					id,
					type: 'code_block',
					layout: normalize_code_language(block.lang),
					content: { content: block.value ?? '', marks: [], annotations: [] }
				};
				body_ids.push(id);
				break;
			}
			case 'html': {
				if (is_html_comment(block.value ?? '')) break;
				throw new MarkdownConversionError('Raw HTML is not supported (only comments).', {
					source,
					position: block.position
				});
			}
			case 'thematicBreak': {
				const hint =
					index === 0 && block.position?.start?.line === 1
						? ' If this is YAML frontmatter, note that frontmatter is not supported.'
						: '';
				throw new MarkdownConversionError(`Thematic breaks (---) are not supported.${hint}`, {
					source,
					position: block.position
				});
			}
			default:
				throw new MarkdownConversionError(
					`Unsupported markdown block "${block.type}". Supported blocks: paragraphs, headings (1-4), lists, code blocks.`,
					{ source, position: block.position }
				);
		}
	}
	flush_prose();

	if (toc) {
		insert_toc(ctx, headings, { body_ids, prose_ids_by_container, section_boundaries });
	}

	// Wrap each section's body range (its prose plus interleaved code blocks,
	// up to the next section) in a section mark, so it renders as one visual
	// group. Content before the first Markdown level-2 heading stays unwrapped.
	const body_marks: { start_offset: number; end_offset: number; node_id: string }[] = [];
	for (const [boundary_index, start] of section_boundaries.entries()) {
		const end = section_boundaries[boundary_index + 1] ?? body_ids.length;
		if (end <= start) continue;
		const section_id = next_id(ctx);
		ctx.nodes[section_id] = { id: section_id, type: 'section' };
		body_marks.push({ start_offset: start, end_offset: end, node_id: section_id });
	}

	const image_id = next_id(ctx);
	ctx.nodes[image_id] = { id: image_id, type: 'image', ...MEDIA_DEFAULTS };

	ctx.nodes[ctx.doc_id] = {
		id: ctx.doc_id,
		type: 'page',
		title: { content: '', marks: [], annotations: [] },
		description: { content: '', marks: [], annotations: [] },
		image: image_id,
		body: { nodes: body_ids, marks: body_marks, annotations: [] }
	};

	return { document_id: ctx.doc_id, nodes: ctx.nodes };
}

function next_id(ctx: Ctx): string {
	let id: string;
	do {
		ctx.counter += 1;
		id = `${ctx.doc_id}_${ctx.counter}`;
	} while (ctx.used_ids.has(id));
	ctx.used_ids.add(id);
	return id;
}

/**
 * Derive a stable, human-readable id for a heading so it can be targeted with
 * `#fragment` links (svedit's Node component renders `id={node.id}` in the DOM).
 *
 * Uses GitHub's anchor algorithm (lowercase, strip punctuation, each
 * whitespace character becomes a dash, duplicates get -1/-2 suffixes) so the
 * same fragment links work in the repo view and on the website. One
 * divergence: node ids must start with a letter or underscore, so slugs with
 * a leading digit get an "h-" prefix.
 */
function heading_id(ctx: Ctx, block: any): string {
	const text = collect_plain_text(block.children);
	let slug = text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s_-]/gu, '')
		.replace(/\s/g, '-');
	if (slug === '') slug = 'heading';
	if (!/^[\p{L}_]/u.test(slug)) slug = `h-${slug}`;

	let id = slug;
	let suffix = 1;
	while (ctx.used_ids.has(id)) {
		id = `${slug}-${suffix}`;
		suffix += 1;
	}
	ctx.used_ids.add(id);
	return id;
}

function collect_plain_text(children: any[]): string {
	let text = '';
	for (const child of children) {
		if (typeof child.value === 'string') text += child.value;
		else if (Array.isArray(child.children)) text += collect_plain_text(child.children);
	}
	return text;
}

/**
 * Convert an unordered list into a `descriptive_listing` when every item
 * follows the convention:
 *
 *   - **title** — description
 *   - **title** — description — meta
 *
 * (bold leading title, " — " separators, plain text otherwise). Returns the
 * listing node id, or null when the list does not match — it then converts as
 * a plain list. `descriptive_listing` lives at the page body level, next to
 * prose and code blocks.
 */
function convert_descriptive_listing(ctx: Ctx, block: any): string | null {
	if (block.ordered === true) return null;

	const rows: { title: string; description: string; meta: string }[] = [];

	for (const item of block.children) {
		const blocks = item.children ?? [];
		if (blocks.length !== 1 || blocks[0].type !== 'paragraph') return null;

		const [first, ...rest] = blocks[0].children;
		if (first?.type !== 'strong') return null;
		if (!first.children.every((child: any) => child.type === 'text')) return null;
		if (!rest.every((child: any) => child.type === 'text')) return null;

		const title = collect_plain_text(first.children).replaceAll('\n', ' ');
		const remainder = rest
			.map((child: any) => child.value)
			.join('')
			.replaceAll('\n', ' ');
		if (!remainder.startsWith(' — ')) return null;

		const segments = remainder.slice(3).split(' — ');
		if (segments.length > 2) return null;

		rows.push({
			title,
			description: segments[0].trim(),
			meta: (segments[1] ?? '').trim()
		});
	}

	if (rows.length === 0) return null;

	const item_ids: string[] = [];
	for (const row of rows) {
		const id = next_id(ctx);
		ctx.nodes[id] = {
			id,
			type: 'descriptive_listing_item',
			title: { content: row.title, marks: [], annotations: [] },
			description: { content: row.description, marks: [], annotations: [] },
			meta: { content: row.meta, marks: [], annotations: [] }
		};
		item_ids.push(id);
	}

	const listing_id = next_id(ctx);
	ctx.nodes[listing_id] = {
		id: listing_id,
		type: 'descriptive_listing',
		layout: 'narrow-left',
		items: { nodes: item_ids, marks: [], annotations: [] }
	};
	return listing_id;
}

function convert_list(ctx: Ctx, block: any): string {
	const item_ids: string[] = [];

	for (const item of block.children) {
		const blocks = item.children ?? [];
		const nested_list = blocks.find((child: any) => child.type === 'list');
		if (nested_list) {
			throw new MarkdownConversionError(
				'Nested lists are not supported (list items are single lines).',
				{ source: ctx.source, position: nested_list.position }
			);
		}
		if (blocks.length > 1 || (blocks.length === 1 && blocks[0].type !== 'paragraph')) {
			throw new MarkdownConversionError(
				'List items must contain a single paragraph (no multiple blocks).',
				{ source: ctx.source, position: item.position }
			);
		}

		const id = next_id(ctx);
		ctx.nodes[id] = {
			id,
			type: 'list_item',
			content:
				blocks.length === 0
					? { content: '', marks: [], annotations: [] }
					: convert_inline(ctx, blocks[0].children, {
							allow_newlines: content_allows_newlines('list_item')
						})
		};
		item_ids.push(id);
	}

	const list_id = next_id(ctx);
	ctx.nodes[list_id] = {
		id: list_id,
		type: 'list',
		layout: block.ordered === true ? 'decimal' : 'square',
		list_items: { nodes: item_ids, marks: [], annotations: [] }
	};
	return list_id;
}

/**
 * Flatten mdast inline nodes into an annotated text value, minting mark nodes
 * into the document graph.
 *
 * Svedit stores marks as separate nodes referenced by
 * `{ start_offset, end_offset, node_id }` ranges, with offsets counted in
 * grapheme clusters, and requires ranges to be mutually exclusive — nested
 * inline formatting cannot be represented and is rejected.
 */
function convert_inline(
	ctx: Ctx,
	children: any[],
	{ allow_newlines }: { allow_newlines: boolean }
): { content: string; marks: any[]; annotations: any[] } {
	let content = '';
	const utf16_ranges: { start: number; end: number; type: string; data?: Record<string, any> }[] =
		[];

	function walk(inline_nodes: any[], inside_mark: boolean) {
		for (const inline of inline_nodes) {
			switch (inline.type) {
				case 'text':
					// Soft line wraps in the source render as spaces (CommonMark
					// semantics); TextProperty would render "\n" as a real break.
					content += inline.value.replaceAll('\n', ' ');
					break;
				case 'break':
					if (!allow_newlines) {
						throw new MarkdownConversionError('Hard line breaks are not allowed here.', {
							source: ctx.source,
							position: inline.position
						});
					}
					content += '\n';
					break;
				case 'inlineCode': {
					assert_not_nested(ctx, inline, inside_mark);
					const start = content.length;
					// Per CommonMark, line endings in code spans become spaces.
					content += inline.value.replaceAll('\n', ' ');
					add_range(start, content.length, 'code');
					break;
				}
				case 'strong':
				case 'emphasis': {
					assert_not_nested(ctx, inline, inside_mark);
					const start = content.length;
					walk(inline.children, true);
					add_range(start, content.length, inline.type);
					break;
				}
				case 'link': {
					assert_not_nested(ctx, inline, inside_mark);
					const href = validate_href(ctx, inline);
					const start = content.length;
					walk(inline.children, true);
					add_range(start, content.length, 'link', { href, target: '_self' });
					break;
				}
				case 'html':
					if (is_html_comment(inline.value ?? '')) break;
					throw new MarkdownConversionError('Inline HTML is not supported (only comments).', {
						source: ctx.source,
						position: inline.position
					});
				case 'image':
					throw new MarkdownConversionError(
						'Images are not supported yet (the media model requires Editable asset ids).',
						{ source: ctx.source, position: inline.position }
					);
				default:
					throw new MarkdownConversionError(
						`Unsupported inline markdown construct "${inline.type}".`,
						{ source: ctx.source, position: inline.position }
					);
			}
		}
	}

	function add_range(start: number, end: number, type: string, data?: Record<string, any>) {
		if (start === end) return;
		utf16_ranges.push({ start, end, type, data });
	}

	walk(children, false);

	const marks = to_grapheme_marks(ctx, content, utf16_ranges);
	return { content, marks, annotations: [] };
}

function assert_not_nested(ctx: Ctx, inline: any, inside_mark: boolean) {
	if (inside_mark) {
		throw new MarkdownConversionError(
			'Nested inline formatting (e.g. bold inside a link) is not supported — marks are mutually exclusive in the content model.',
			{ source: ctx.source, position: inline.position }
		);
	}
}

function validate_href(ctx: Ctx, inline: any): string {
	const href = inline.url ?? '';
	const scheme_match = href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

	if (scheme_match) {
		if (!SAFE_LINK_SCHEMES.has(scheme_match[1].toLowerCase())) {
			throw new MarkdownConversionError(`Unsafe link protocol "${scheme_match[1]}:".`, {
				source: ctx.source,
				position: inline.position
			});
		}
	} else if (/\.md($|[#?])/i.test(href)) {
		throw new MarkdownConversionError(
			`Links to .md files are not supported — link to the configured pathname instead (e.g. "/manual"): "${href}".`,
			{ source: ctx.source, position: inline.position }
		);
	}

	return href;
}

/**
 * Convert UTF-16 code-unit ranges to grapheme-cluster mark ranges and mint the
 * mark nodes (svedit counts text offsets in grapheme clusters).
 */
function to_grapheme_marks(
	ctx: Ctx,
	content: string,
	utf16_ranges: { start: number; end: number; type: string; data?: Record<string, any> }[]
): { start_offset: number; end_offset: number; node_id: string }[] {
	if (utf16_ranges.length === 0) return [];

	const segmenter = new Intl.Segmenter();
	// Grapheme index at each UTF-16 boundary
	const boundaries = new Map<number, number>([[0, 0]]);
	let grapheme_index = 0;
	for (const segment of segmenter.segment(content)) {
		grapheme_index += 1;
		boundaries.set(segment.index + segment.segment.length, grapheme_index);
	}

	return utf16_ranges.map((range) => {
		const start_offset = boundaries.get(range.start);
		const end_offset = boundaries.get(range.end);
		if (start_offset === undefined || end_offset === undefined) {
			throw new MarkdownConversionError(
				'Inline formatting boundary falls inside a multi-character glyph.',
				{ source: ctx.source }
			);
		}
		const node_id = next_id(ctx);
		ctx.nodes[node_id] = { id: node_id, type: range.type, ...range.data };
		return { start_offset, end_offset, node_id };
	});
}

/**
 * Insert a generated table of contents in front of the first chapter heading.
 *
 * The toc is a two-column `descriptive_listing`: each row links to a chapter
 * via the heading anchor, with the chapter title and — as description — the
 * first sentence of the chapter's first paragraph. It is inserted at the page
 * body level, before the block holding the first chapter heading (between the
 * intro and the first section in the typical `#` title + `##` chapters case).
 */
function insert_toc(
	ctx: Ctx,
	headings: TocHeading[],
	{
		body_ids,
		prose_ids_by_container,
		section_boundaries
	}: {
		body_ids: string[];
		prose_ids_by_container: Map<string[], string>;
		section_boundaries: number[];
	}
) {
	const selection = select_toc_headings(headings);
	if (!selection) return;

	const item_ids: string[] = [];
	for (const heading of selection.targets) {
		const item_id = next_id(ctx);
		ctx.nodes[item_id] = {
			id: item_id,
			type: 'descriptive_listing_item',
			href: `#${heading.id}`,
			target: '_self',
			title: { content: ctx.nodes[heading.id].content.content, marks: [], annotations: [] },
			description: { content: first_sentence(heading.subtitle), marks: [], annotations: [] },
			meta: { content: '', marks: [], annotations: [] }
		};
		item_ids.push(item_id);
	}

	const listing_id = next_id(ctx);
	ctx.nodes[listing_id] = {
		id: listing_id,
		type: 'descriptive_listing',
		layout: 'two-columns',
		items: { nodes: item_ids, marks: [], annotations: [] }
	};

	const container_prose_id = prose_ids_by_container.get(selection.insert_before.container);
	const prose_index = body_ids.indexOf(container_prose_id ?? '');
	const body_index = prose_index === -1 ? 0 : prose_index;
	body_ids.splice(body_index, 0, listing_id);
	for (const [index, boundary] of section_boundaries.entries()) {
		if (boundary >= body_index) section_boundaries[index] = boundary + 1;
	}

	// Group the intro and the toc into one leading section, so the page opens
	// with the same visual structure the chapters have.
	if (section_boundaries.length > 0 && section_boundaries[0] !== 0) {
		section_boundaries.unshift(0);
	}
}

function first_sentence(text: string): string {
	const match = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
	return (match ? match[0] : text).trim();
}
