import { expect, it } from 'vitest';
import { fill_document_defaults, validate_document } from 'svedit';
import type { Attachment, Document, PropertyDefinition } from 'svedit';
import { document_schema } from '#app/document_schema.js';
import {
	default_banner_document,
	default_footer_document,
	default_nav_document,
	default_page_document
} from '#app/default_site.js';
import { stable_json } from '#app/translations.js';
import { EdfError, parse_edf, serialize_edf } from './edf.js';

const shared_documents = [default_banner_document, default_nav_document, default_footer_document];
const shared_ids = shared_documents.map((doc) => doc.document_id);
const shared_nodes = Object.assign({}, ...shared_documents.map((doc) => doc.nodes));

/** Stored JSON with defaults filled and ranges in text order, neither of which EDF carries. */
function normalize(doc: Document) {
	const filled = fill_document_defaults(doc, document_schema);
	const by_position = (a: Attachment, b: Attachment) => a.start_offset - b.start_offset;
	for (const node of Object.values(filled.nodes)) {
		const properties = document_schema[node.type]?.properties ?? {};
		for (const [name, definition] of Object.entries<PropertyDefinition>(properties)) {
			if ((definition.type !== 'text' && definition.type !== 'node_array') || !node[name]) continue;
			node[name] = {
				...node[name],
				marks: [...(node[name].marks ?? [])].sort(by_position),
				annotations: [...(node[name].annotations ?? [])].sort(by_position)
			};
		}
	}
	return stable_json(filled);
}

const [banner_id, nav_id, footer_id] = shared_ids;
const sample: Document = {
	document_id: 'about',
	nodes: {
		about: {
			id: 'about',
			type: 'page',
			title: { content: 'About & <us>', marks: [], annotations: [] },
			image: 'img',
			body: {
				nodes: ['pr', 'fig'],
				marks: [{ start_offset: 0, end_offset: 1, node_id: 's' }],
				annotations: []
			},
			banner: banner_id,
			nav: nav_id,
			footer: footer_id
		},
		img: { id: 'img', type: 'image', src: 'a.webp', width: 10, height: 5, alt: 'A "cat"' },
		s: { id: 's', type: 'section' },
		pr: { id: 'pr', type: 'prose', body: { nodes: ['t1', 't2'], marks: [], annotations: [] } },
		t1: {
			id: 't1',
			type: 'paragraph',
			layout: 'muted',
			content: {
				content: 'Hi 😀 you & all\nAgain',
				marks: [
					{ start_offset: 11, end_offset: 14, node_id: 'st' },
					{ start_offset: 5, end_offset: 8, node_id: 'm' }
				],
				annotations: []
			}
		},
		m: { id: 'm', type: 'link', href: '/x', target: '_blank' },
		st: { id: 'st', type: 'strong' },
		t2: { id: 't2', type: 'heading_2', content: { content: '', marks: [], annotations: [] } },
		fig: { id: 'fig', type: 'figure', media: 'img2' },
		img2: { id: 'img2', type: 'image', src: 'b.webp' }
	}
};

const sample_edf = `<page id="about" banner="${banner_id}" nav="${nav_id}" footer="${footer_id}">
	<title>About &amp; &lt;us&gt;</title>
	<image>
		<image id="img" src="a.webp" width="10" height="5" alt="A &quot;cat&quot;"/>
	</image>
	<body>
		<section id="s">
			<prose id="pr">
				<body>
					<paragraph id="t1" layout="muted">Hi 😀 <link id="m" href="/x" target="_blank">you</link> &amp; <strong id="st">all</strong>
Again</paragraph>
					<heading_2 id="t2"/>
				</body>
			</prose>
		</section>
		<figure id="fig">
			<media>
				<image id="img2" src="b.webp"/>
			</media>
		</figure>
	</body>
</page>
`;

/** Ids for new nodes, the same sequence on the JSON and the EDF side. */
function id_sequence() {
	let counter = 0;
	return () => `new${++counter}`;
}

it('writes attributes for primitives, elements for structure, and inline tags for ranges', () => {
	expect(serialize_edf(sample, document_schema, { exclude: shared_ids })).toBe(sample_edf);
});

it('parses back to exactly the stored document, ids of marks and sections included', () => {
	const parsed = parse_edf(sample_edf, document_schema);
	expect(normalize(parsed)).toBe(normalize(sample));
	// Like saves, validation runs on the document with defaults filled.
	validate_document(
		fill_document_defaults(
			{ ...parsed, nodes: { ...shared_nodes, ...parsed.nodes } },
			document_schema
		),
		document_schema
	);
});

/**
 * The contract: an edit made the editor's way, on the JSON, and the same edit
 * made the agent's way, on the EDF, give the identical document, ids included.
 */
it.each([
	{
		name: 'editing text before a link keeps the link and shifts it',
		json: (doc: Document) => {
			doc.nodes.t1.content.content = 'Hello 😀 you & all\nAgain';
			doc.nodes.t1.content.marks = [
				{ start_offset: 8, end_offset: 11, node_id: 'm' },
				{ start_offset: 14, end_offset: 17, node_id: 'st' }
			];
		},
		edf: (text: string) => text.replace('>Hi 😀 ', '>Hello 😀 ')
	},
	{
		name: 'replacing a link with an identical new one gives it a new id',
		json: (doc: Document) => {
			delete doc.nodes.m;
			doc.nodes.new1 = { id: 'new1', type: 'link', href: '/x', target: '_blank' };
			doc.nodes.t1.content.marks[1].node_id = 'new1';
		},
		edf: (text: string) => text.replace('<link id="m" ', '<link ')
	},
	{
		name: 'moving bold to another word gives the new bold a new id',
		json: (doc: Document) => {
			delete doc.nodes.st;
			doc.nodes.new1 = { id: 'new1', type: 'strong' };
			doc.nodes.t1.content.marks[0] = { start_offset: 15, end_offset: 20, node_id: 'new1' };
		},
		edf: (text: string) =>
			text.replace('<strong id="st">all</strong>\nAgain', 'all\n<strong>Again</strong>')
	},
	{
		name: 'moving a block keeps its id',
		json: (doc: Document) => {
			doc.nodes.pr.body.nodes = ['t2', 't1'];
		},
		edf: (text: string) => {
			const heading = '\t\t\t\t\t<heading_2 id="t2"/>\n';
			return text.replace(heading, '').replace('\t\t\t\t\t<paragraph id="t1"', `${heading}$&`);
		}
	},
	{
		name: 'new blocks and marks get ids in document order',
		json: (doc: Document) => {
			doc.nodes.pr.body.nodes.push('new1');
			doc.nodes.new1 = {
				id: 'new1',
				type: 'paragraph',
				content: {
					content: 'See more',
					marks: [{ start_offset: 4, end_offset: 8, node_id: 'new2' }],
					annotations: []
				}
			};
			doc.nodes.new2 = { id: 'new2', type: 'emphasis' };
		},
		edf: (text: string) =>
			text.replace(
				'<heading_2 id="t2"/>\n',
				'<heading_2 id="t2"/>\n\t\t\t\t\t<paragraph>See <emphasis>more</emphasis></paragraph>\n'
			)
	},
	{
		name: 'removing a section wrapper removes its range node',
		json: (doc: Document) => {
			delete doc.nodes.s;
			doc.nodes.about.body.marks = [];
		},
		edf: (text: string) =>
			text.replace('\t\t<section id="s">\n', '').replace('\t\t</section>\n', '')
	}
])('$name', ({ json, edf }) => {
	const expected = structuredClone(sample);
	json(expected);
	const actual = parse_edf(edf(sample_edf), document_schema, { generate_id: id_sequence() });
	expect(normalize(actual)).toBe(normalize(expected));
});

it('round-trips the default site, including the shared documents on their own', () => {
	const page = {
		document_id: default_page_document.document_id,
		nodes: { ...shared_nodes, ...default_page_document.nodes }
	};
	const edf = serialize_edf(page, document_schema, { exclude: shared_ids });
	expect(edf).not.toMatch(/offset|node_id/);
	const parsed = parse_edf(edf, document_schema);
	const merged = { document_id: parsed.document_id, nodes: { ...shared_nodes, ...parsed.nodes } };
	expect(normalize(merged)).toBe(normalize(page));
	validate_document(fill_document_defaults(merged, document_schema), document_schema);

	for (const doc of shared_documents) {
		const reparsed = parse_edf(serialize_edf(doc, document_schema), document_schema);
		expect(normalize(reparsed)).toBe(normalize(doc));
	}
});

it('refuses schemas whose element names could be read two ways', () => {
	const doc = { document_id: 'd', nodes: { d: { id: 'd', type: 'doc' } } };
	const schema_with = (properties: object, extra: object = {}) => ({
		doc: { kind: 'document', properties },
		block: { kind: 'block', properties: {} },
		x: { kind: 'mark', properties: {} },
		...extra
	});
	const refuses = (schema: object, message: string) =>
		expect(() => serialize_edf(doc, schema as never)).toThrow(message);

	refuses(
		schema_with({ items: { type: 'node_array', node_types: ['block', 'x'], mark_types: ['x'] } }),
		'doc.items allows x as both child and range'
	);
	refuses(
		schema_with({
			body: { type: 'text', mark_types: ['x'], annotation_types: ['x'], allow_newlines: false }
		}),
		'doc.body allows x as both mark and annotation'
	);
	refuses(
		schema_with(
			{},
			{
				note: {
					kind: 'text',
					properties: {
						layout: { type: 'string' },
						content: { type: 'text', mark_types: ['layout'], allow_newlines: false }
					}
				},
				layout: { kind: 'mark', properties: {} }
			}
		),
		'note.content allows ranges named like properties of note: layout'
	);
});

it('reports mistakes with line numbers', () => {
	const parse = (text: string) => () => parse_edf(text, document_schema);
	expect(parse('<page id="p">\n\t<titel>x</titel>\n</page>')).toThrow(
		'Line 2: <page> has no property "titel"'
	);
	expect(parse('<page id="p">\n\t<title>a <strong>b</strong></title>\n</page>')).toThrow(
		'Line 2: <strong> is not allowed in page.title'
	);
	expect(parse('<paragraph id="p"><strong>a <emphasis>b</emphasis></strong></paragraph>')).toThrow(
		'marks cannot be nested'
	);
	expect(parse('<page id="p">\n\t<body>\n\t\t<prose id="x">\n</page>')).toThrow(
		'Line 4: </page> does not close <prose> from line 3'
	);
	expect(parse('<page>\n</page>')).toThrow('needs an id attribute');
	expect(parse('<page id="p"><image><image width="ten"/></image></page>')).toThrow(
		'Line 1: image.width must be an integer, got "ten"'
	);
	expect(parse('<page id="p">stray</page>')).toThrow('text is not allowed directly inside <page>');
	expect(parse('<page id="p"><title>a &nbsp; b</title></page>')).toThrow('unknown entity &nbsp;');
	expect(parse('<page id="p"><body><bogus/></body></page>')).toThrow(
		'<bogus> is not allowed in page.body'
	);
	// Marks share the id space of nodes.
	expect(parse('<paragraph id="p">a <strong id="p">b</strong></paragraph>')).toThrow(
		'duplicate node id p'
	);

	const overlapping = structuredClone(sample);
	overlapping.nodes.t1.content.marks = [
		{ start_offset: 0, end_offset: 6, node_id: 'st' },
		{ start_offset: 5, end_offset: 8, node_id: 'm' }
	];
	expect(() => serialize_edf(overlapping, document_schema)).toThrow(EdfError);
	expect(() => serialize_edf(overlapping, document_schema)).toThrow('t1.content has overlapping');
});
