import { describe, it, expect } from 'vitest';
import { convert_markdown, MarkdownConversionError } from './convert.js';
import { compose_markdown_document } from './compose.js';

const MAPPING = { source: 'manual.md', pathname: '/manual' };

const SHARED_DOCUMENTS = {
	banner_document: {
		document_id: 'banner_1',
		nodes: { banner_1: { id: 'banner_1', type: 'banner' } }
	},
	nav_document: { document_id: 'nav_1', nodes: { nav_1: { id: 'nav_1', type: 'nav' } } },
	footer_document: {
		document_id: 'footer_1',
		nodes: { footer_1: { id: 'footer_1', type: 'footer' } }
	}
};

import type { Document } from 'svedit';

function convert(
	markdown: string,
	mapping: { source: string; pathname: string; toc?: boolean } = MAPPING
) {
	return convert_markdown(markdown, mapping);
}

function page_body_nodes(doc: Document) {
	return doc.nodes[doc.document_id].body.nodes.map((id: string) => doc.nodes[id]);
}

function flat_text_nodes(doc: Document) {
	return page_body_nodes(doc).flatMap((block: any) =>
		block.type === 'prose' ? block.body.nodes.map((id: string) => doc.nodes[id]) : [block]
	);
}

describe('convert_markdown', () => {
	it('produces a page whose composed document validates against the schema', () => {
		const doc = convert(
			'# Title\n\nIntro with **bold** and a [link](https://example.com).\n\n' +
				'## Chapter\n\n- one\n- two\n\n```js\nconsole.log(1);\n```\n\nOutro.'
		);
		expect(() => compose_markdown_document(doc, SHARED_DOCUMENTS)).not.toThrow();
	});

	it('wraps text blocks in prose and splits prose runs at code blocks', () => {
		const doc = convert('One.\n\n```\ncode\n```\n\nTwo.');
		const body = page_body_nodes(doc);
		expect(body.map((node) => node.type)).toEqual(['prose', 'code_block', 'prose']);
		expect(body[1].content.content).toBe('code');
		expect(body[1].layout).toBe('plain');
	});

	it.each([
		['js', 'javascript'],
		['ts', 'typescript'],
		['jsx', 'tsx'],
		['svelte', 'svelte'],
		['yml', 'yaml'],
		['unknown', 'plain']
	])('imports a %s fence as %s', (language, layout) => {
		const doc = convert('```' + language + '\nconst value = 1;\n```');
		expect(page_body_nodes(doc)[0]).toMatchObject({ type: 'code_block', layout });
		expect(() => compose_markdown_document(doc, SHARED_DOCUMENTS)).not.toThrow();
	});

	it('maps markdown headings 1-4 directly to Editable headings 1-4', () => {
		const doc = convert('# A\n\n## B\n\n### C\n\n#### D\n\nText.');
		expect(flat_text_nodes(doc).map((node) => node.type)).toEqual([
			'heading_1',
			'heading_2',
			'heading_3',
			'heading_4',
			'paragraph'
		]);
	});

	it('rejects heading levels 5 and 6', () => {
		expect(() => convert('##### Deep')).toThrow(/Heading level 5/);
		expect(() => convert('###### Deeper')).toThrow(/Heading level 6/);
	});

	it('gives headings GitHub-style anchor ids and dedupes duplicates', () => {
		const doc = convert('## Getting started\n\n## Getting started\n\n## 2024 roadmap');
		const ids = flat_text_nodes(doc).map((node) => node.id);
		expect(ids).toEqual(['getting-started', 'getting-started-1', 'h-2024-roadmap']);
	});

	it('matches GitHub anchors for punctuation and ampersands', () => {
		const doc = convert('## Backup, sync & recovery\n\n## Automated backups (optional)');
		const ids = flat_text_nodes(doc).map((node) => node.id);
		expect(ids).toEqual(['backup-sync--recovery', 'automated-backups-optional']);
	});

	it('skips html comments in blocks and inline text', () => {
		const doc = convert('Before.\n\n<!-- a\nmulti-line comment -->\n\nAfter <!-- inline --> text.');
		const nodes = flat_text_nodes(doc);
		expect(nodes.map((node) => node.content.content)).toEqual(['Before.', 'After  text.']);
	});

	it('still rejects raw html', () => {
		expect(() => convert('<div>raw</div>')).toThrow(/Raw HTML is not supported/);
		expect(() => convert('text with <em>inline</em> html')).toThrow(/Inline HTML/);
	});

	it('converts unordered and ordered lists to semantic layout ids', () => {
		const doc = convert('- a\n- b\n\n1. one\n2. two');
		const lists = flat_text_nodes(doc).filter((node) => node.type === 'list');
		expect(lists.map((list) => list.layout)).toEqual(['square', 'decimal']);
		const first_item = doc.nodes[lists[0].list_items.nodes[0]];
		expect(first_item.type).toBe('list_item');
		expect(first_item.content.content).toBe('a');
	});

	it('rejects nested lists', () => {
		expect(() => convert('- a\n  - nested')).toThrow(/Nested lists/);
	});

	it('rejects multi-block list items', () => {
		expect(() => convert('- a\n\n  second paragraph')).toThrow(/single paragraph/);
	});

	it('converts strong, emphasis, and inline code to mark nodes with ranges', () => {
		const doc = convert('plain **bold** and *soft* and `code`');
		const paragraph = flat_text_nodes(doc)[0];
		expect(paragraph.content.content).toBe('plain bold and soft and code');
		const marks = paragraph.content.marks.map((mark) => ({
			...mark,
			type: doc.nodes[mark.node_id].type
		}));
		expect(marks).toEqual([
			{ start_offset: 6, end_offset: 10, node_id: marks[0].node_id, type: 'strong' },
			{ start_offset: 15, end_offset: 19, node_id: marks[1].node_id, type: 'emphasis' },
			{ start_offset: 24, end_offset: 28, node_id: marks[2].node_id, type: 'code' }
		]);
	});

	it('counts mark offsets in grapheme clusters', () => {
		const doc = convert('👨‍👩‍👧‍👦 family **bold**');
		const paragraph = flat_text_nodes(doc)[0];
		const [mark] = paragraph.content.marks;
		// The family emoji is one grapheme: "👨‍👩‍👧‍👦 family " = 9 graphemes.
		expect(mark.start_offset).toBe(9);
		expect(mark.end_offset).toBe(13);
	});

	it('converts links into link mark nodes with href and target', () => {
		const doc = convert('See [the manual](/manual) now');
		const paragraph = flat_text_nodes(doc)[0];
		const [mark] = paragraph.content.marks;
		const link = doc.nodes[mark.node_id];
		expect(link).toMatchObject({ type: 'link', href: '/manual', target: '_self' });
		expect(paragraph.content.content.slice(mark.start_offset, mark.end_offset)).toBe('the manual');
	});

	it('rejects unsafe link protocols', () => {
		expect(() => convert('[x](javascript:alert(1))')).toThrow(/Unsafe link protocol/);
	});

	it('allows http, https, mailto, absolute, and fragment links', () => {
		expect(() =>
			convert(
				'[a](https://example.com) [b](http://example.com) [c](mailto:x@y.z) [d](/page) [e](#section)'
			)
		).not.toThrow();
	});

	it('rejects relative .md links with a hint', () => {
		expect(() => convert('[x](getting-started.md)')).toThrow(/configured pathname/);
	});

	it('rejects nested inline formatting', () => {
		expect(() => convert('**bold with [link](/x)**')).toThrow(/Nested inline formatting/);
		expect(() => convert('*emphasis with **strong***')).toThrow(/Nested inline formatting/);
	});

	it('turns soft line wraps into spaces', () => {
		const doc = convert('wrapped\nline');
		expect(flat_text_nodes(doc)[0].content.content).toBe('wrapped line');
	});

	it('keeps hard breaks as newlines in paragraphs', () => {
		const doc = convert('first\\\nsecond');
		expect(flat_text_nodes(doc)[0].content.content).toBe('first\nsecond');
	});

	it('follows the schema for hard breaks in list items (allow_newlines)', () => {
		// list_item.content currently has allow_newlines: true in document_schema.
		const doc = convert('- first\\\nsecond');
		const list = flat_text_nodes(doc).find((node) => node.type === 'list');
		expect(doc.nodes[list.list_items.nodes[0]].content.content).toBe('first\nsecond');
	});

	it('rejects blockquotes and thematic breaks', () => {
		expect(() => convert('> quote')).toThrow(/Unsupported markdown block/);
		expect(() => convert('text\n\n---\n\nmore')).toThrow(/Thematic breaks/);
	});

	it('hints about frontmatter for a leading thematic break', () => {
		expect(() => convert('---\ntitle: X\n---\n\nBody')).toThrow(/frontmatter is not supported/);
	});

	it('rejects images with a source-located error', () => {
		try {
			convert('An image:\n\n![alt](image.png)');
			expect.unreachable('should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(MarkdownConversionError);
			expect(error.message).toMatch(/^manual\.md:3:1/);
			expect(error.message).toMatch(/asset ids/);
		}
	});

	it('is deterministic for unchanged input', () => {
		const markdown = '# Title\n\n## A\n\nText **bold**.\n\n## B\n\n- item';
		expect(convert(markdown)).toEqual(convert(markdown));
	});

	describe('table of contents', () => {
		const TOC_MAPPING = { ...MAPPING, toc: true };
		const MANUAL = '# Manual\n\nIntro prose.\n\n## Install\n\nText.\n\n## Usage\n\nMore text.';

		it('inserts a linked descriptive listing before the first chapter heading', () => {
			const doc = convert(MANUAL, TOC_MAPPING);
			const nodes = flat_text_nodes(doc);
			const types = nodes.map((node) => node.type);
			expect(types).toEqual([
				'heading_1',
				'paragraph',
				'descriptive_listing',
				'heading_2',
				'paragraph',
				'heading_2',
				'paragraph'
			]);
			const toc = nodes[2];
			expect(toc.layout).toBe('two-columns');
			const items = toc.items.nodes.map((id) => doc.nodes[id]);
			expect(items.map((item) => item.title.content)).toEqual(['Install', 'Usage']);
			expect(items.map((item) => item.href)).toEqual(['#install', '#usage']);
			expect(items.map((item) => item.description.content)).toEqual(['Text.', 'More text.']);
		});

		it('produces a valid composed document', () => {
			const doc = convert(MANUAL, TOC_MAPPING);
			expect(() => compose_markdown_document(doc, SHARED_DOCUMENTS)).not.toThrow();
		});

		it('omits the toc with fewer than two chapter headings', () => {
			const doc = convert('# Title\n\n## Only chapter\n\nText.', TOC_MAPPING);
			expect(flat_text_nodes(doc).some((node) => node.type === 'descriptive_listing')).toBe(false);
		});

		it('omits the toc when there are no headings below the first depth', () => {
			const doc = convert('# One\n\nText.\n\n# Two\n\nText.', TOC_MAPPING);
			expect(flat_text_nodes(doc).some((node) => node.type === 'descriptive_listing')).toBe(false);
		});

		it('uses the shallowest depth below the first heading', () => {
			const doc = convert('# T\n\n### Deep A\n\nx\n\n## Chapter A\n\nx\n\n## Chapter B', {
				...MAPPING,
				toc: true
			});
			const toc = flat_text_nodes(doc).find((node) => node.type === 'descriptive_listing');
			const items = toc.items.nodes.map((id) => doc.nodes[id].title.content);
			expect(items).toEqual(['Chapter A', 'Chapter B']);
		});

		it('places the toc between intro and first section, sharing a section with the intro', () => {
			const doc = convert(MANUAL, TOC_MAPPING);
			const body = page_body_nodes(doc);
			expect(body.map((node) => node.type)).toEqual([
				'prose',
				'descriptive_listing',
				'prose',
				'prose'
			]);
			// Intro and toc form one leading section, followed by the chapters.
			const marks = doc.nodes[doc.document_id].body.marks;
			expect(marks.map((mark) => [mark.start_offset, mark.end_offset])).toEqual([
				[0, 2],
				[2, 3],
				[3, 4]
			]);
		});

		it('uses the first sentence of the first paragraph as the description', () => {
			const doc = convert(
				'# T\n\n## Setup\n\nFirst sentence here. Second sentence is skipped.\n\n## Usage\n\n### Sub first\n\nParagraph under a subheading still describes Usage.',
				TOC_MAPPING
			);
			const toc = flat_text_nodes(doc).find((node) => node.type === 'descriptive_listing');
			const descriptions = toc.items.nodes.map((id) => doc.nodes[id].description.content);
			expect(descriptions).toEqual([
				'First sentence here.',
				'Paragraph under a subheading still describes Usage.'
			]);
		});

		it('inserts the toc before the containing block when chapters are below level 2', () => {
			const doc = convert('## Top\n\n### A\n\nx\n\n### B\n\nx', TOC_MAPPING);
			const body = page_body_nodes(doc);
			expect(body.map((node) => node.type)).toEqual(['descriptive_listing', 'prose']);
			// The toc gets a leading section; the content section follows.
			const marks = doc.nodes[doc.document_id].body.marks;
			expect(marks.map((mark) => [mark.start_offset, mark.end_offset])).toEqual([
				[0, 1],
				[1, 2]
			]);
		});
	});

	describe('descriptive listings', () => {
		it('converts a matching list into a top-level descriptive_listing', () => {
			const doc = convert(
				'Intro.\n\n' +
					'- **data:pull** — Copy the live data to your machine\n' +
					'- **data:push** — Replace the live data — guarded, undoable\n\n' +
					'Outro.'
			);
			const body = page_body_nodes(doc);
			expect(body.map((node) => node.type)).toEqual(['prose', 'descriptive_listing', 'prose']);
			const rows = body[1].items.nodes.map((id) => doc.nodes[id]);
			expect(rows.map((row) => row.type)).toEqual([
				'descriptive_listing_item',
				'descriptive_listing_item'
			]);
			expect(rows[0].title.content).toBe('data:pull');
			expect(rows[0].description.content).toBe('Copy the live data to your machine');
			expect(rows[0].meta.content).toBe('');
			expect(rows[1].description.content).toBe('Replace the live data');
			expect(rows[1].meta.content).toBe('guarded, undoable');
		});

		it('validates against the schema when composed', () => {
			const doc = convert('- **a** — b — c\n- **d** — e');
			expect(() => compose_markdown_document(doc, SHARED_DOCUMENTS)).not.toThrow();
		});

		it('falls back to a plain list unless every item matches', () => {
			const doc = convert('- **a** — description\n- plain item without title');
			const types = flat_text_nodes(doc).map((node) => node.type);
			expect(types).toEqual(['list']);
		});

		it('leaves ordered lists and marked-up items as plain lists', () => {
			const ordered = convert('1. **a** — b\n2. **c** — d');
			expect(flat_text_nodes(ordered).some((node) => node.type === 'list')).toBe(true);

			const marked = convert('- **a** — has `code` in it\n- **b** — plain');
			expect(flat_text_nodes(marked).some((node) => node.type === 'list')).toBe(true);
		});

		it('rejects items with more than two separator segments', () => {
			const doc = convert('- **a** — b — c — d\n- **e** — f');
			expect(flat_text_nodes(doc).map((node) => node.type)).toEqual(['list']);
		});

		it('stays inside its section', () => {
			const doc = convert('# T\n\n## Chapter\n\n- **a** — b\n- **c** — d\n\nText.');
			const marks = doc.nodes[doc.document_id].body.marks;
			const body = doc.nodes[doc.document_id].body.nodes;
			expect(marks).toHaveLength(1);
			expect([marks[0].start_offset, marks[0].end_offset]).toEqual([1, body.length]);
		});
	});

	describe('sections', () => {
		it('starts a section at each level-2 heading, keeping code blocks inside', () => {
			const doc = convert('# T\n\nIntro.\n\n## A\n\nx\n\n```\ncode\n```\n\ny\n\n## B\n\nz');
			const page = doc.nodes[doc.document_id];
			expect(page.body.nodes.map((id) => doc.nodes[id].type)).toEqual([
				'prose',
				'prose',
				'code_block',
				'prose',
				'prose'
			]);
			const marks = page.body.marks.map((mark) => ({
				start: mark.start_offset,
				end: mark.end_offset,
				type: doc.nodes[mark.node_id].type
			}));
			expect(marks).toEqual([
				{ start: 1, end: 4, type: 'section' },
				{ start: 4, end: 5, type: 'section' }
			]);
		});

		it('leaves documents without level-2 headings unsectioned', () => {
			const doc = convert('# T\n\nText.\n\n### Deep\n\nMore.');
			expect(doc.nodes[doc.document_id].body.marks).toEqual([]);
		});

		it('produces a valid composed document with sections', () => {
			const doc = convert('# T\n\nIntro.\n\n## A\n\nx\n\n## B\n\ny');
			expect(() => compose_markdown_document(doc, SHARED_DOCUMENTS)).not.toThrow();
		});
	});
});

describe('compose_markdown_document', () => {
	it('merges shared nodes and sets banner/nav/footer references', () => {
		const doc = compose_markdown_document(convert('# Hi'), SHARED_DOCUMENTS);
		const page = doc.nodes[doc.document_id];
		expect(page.banner).toBe('banner_1');
		expect(page.nav).toBe('nav_1');
		expect(page.footer).toBe('footer_1');
		expect(doc.nodes.banner_1.type).toBe('banner');
		expect(doc.nodes.nav_1.type).toBe('nav');
		expect(doc.nodes.footer_1.type).toBe('footer');
	});

	it('rejects node id collisions with shared documents', () => {
		const page_doc = convert('# Hi');
		const shared = structuredClone(SHARED_DOCUMENTS);
		shared.nav_document.nodes[page_doc.document_id] = {
			id: page_doc.document_id,
			type: 'nav_link'
		};
		expect(() => compose_markdown_document(page_doc, shared)).toThrow(/collides/);
	});

	it('fails without shared documents', () => {
		expect(() => compose_markdown_document(convert('# Hi'), {} as any)).toThrow(/banner document/);
	});
});
