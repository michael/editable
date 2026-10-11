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
		<section>
			<prose id="pr">
				<body>
					<paragraph id="t1" layout="muted">Hi 😀 <link href="/x" target="_blank">you</link> &amp; <strong>all</strong>
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

it('writes attributes for primitives, elements for structure, and inline tags for ranges', () => {
	expect(serialize_edf(sample, document_schema, { exclude: shared_ids })).toBe(sample_edf);
});

it('parses back to the stored document, reusing the ids of unchanged marks', () => {
	const parsed = parse_edf(sample_edf, document_schema, { stored: sample.nodes });
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

it('assigns ids to new nodes and marks and keeps ids of moved marks', () => {
	let counter = 0;
	const generate_id = () => `new${++counter}`;
	const edited = sample_edf
		.replace('Hi 😀 <link', 'Hello 😀 <link')
		.replace('<strong>all</strong>', '<emphasis>all</emphasis>')
		.replace('<heading_2 id="t2"/>', '<heading_2>Fresh</heading_2>');
	const { nodes } = parse_edf(edited, document_schema, { stored: sample.nodes, generate_id });
	const content = nodes.t1.content;
	expect(content.content).toBe('Hello 😀 you & all\nAgain');
	// The link moved with the text; same href, so it keeps its id.
	expect(content.marks).toContainEqual({ start_offset: 8, end_offset: 11, node_id: 'm' });
	expect(nodes.m).toEqual({ id: 'm', type: 'link', href: '/x', target: '_blank' });
	// Nodes get ids while parsing; marks afterwards. The replaced strong mark is gone.
	expect(nodes.new1).toMatchObject({ type: 'heading_2', content: { content: 'Fresh' } });
	expect(nodes.pr.body.nodes).toEqual(['t1', 'new1']);
	expect(nodes.new2).toEqual({ id: 'new2', type: 'emphasis' });
	expect(nodes.st).toBeUndefined();
});

it('round-trips the default site, including the shared documents on their own', () => {
	const page = {
		document_id: default_page_document.document_id,
		nodes: { ...shared_nodes, ...default_page_document.nodes }
	};
	const edf = serialize_edf(page, document_schema, { exclude: shared_ids });
	expect(edf).not.toMatch(/offset|node_id/);
	const parsed = parse_edf(edf, document_schema, { stored: page.nodes });
	const merged = { document_id: parsed.document_id, nodes: { ...shared_nodes, ...parsed.nodes } };
	expect(normalize(merged)).toBe(normalize(page));
	validate_document(fill_document_defaults(merged, document_schema), document_schema);

	for (const doc of shared_documents) {
		const reparsed = parse_edf(serialize_edf(doc, document_schema), document_schema, {
			stored: doc.nodes
		});
		expect(normalize(reparsed)).toBe(normalize(doc));
	}
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

	const overlapping = structuredClone(sample);
	overlapping.nodes.t1.content.marks = [
		{ start_offset: 0, end_offset: 6, node_id: 'st' },
		{ start_offset: 5, end_offset: 8, node_id: 'm' }
	];
	expect(() => serialize_edf(overlapping, document_schema)).toThrow(EdfError);
	expect(() => serialize_edf(overlapping, document_schema)).toThrow('t1.content has overlapping');
});
