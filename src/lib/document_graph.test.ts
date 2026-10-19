import { describe, it, expect } from 'vitest';
import { document_schema } from '#app/document_schema.js';
import { clone_subtree_with_new_ids } from './document_graph.js';

function make_id_generator() {
	let counter = 0;
	return () => `new_${++counter}`;
}

// A page with a body containing a prose block, a heading whose text carries a
// link mark pointing at a link node, and shared nav/footer references that live
// in other documents.
function make_page_nodes() {
	return {
		page_1: {
			id: 'page_1',
			type: 'page',
			title: { content: 'Hello', marks: [], annotations: [] },
			description: { content: '', marks: [], annotations: [] },
			image: 'image_1',
			nav: 'nav_doc',
			footer: 'footer_doc',
			body: { nodes: ['prose_1'], marks: [], annotations: [] }
		},
		image_1: { id: 'image_1', type: 'image', src: '/a.png' },
		prose_1: {
			id: 'prose_1',
			type: 'prose',
			layout: 'narrow-left',
			body: { nodes: ['heading_1'], marks: [], annotations: [] }
		},
		heading_1: {
			id: 'heading_1',
			type: 'heading_1',
			content: {
				content: 'Linked',
				marks: [{ start_offset: 0, end_offset: 6, node_id: 'link_1' }],
				annotations: []
			}
		},
		link_1: { id: 'link_1', type: 'link', href: '/somewhere' }
	} as any;
}

const shared_roots = new Set(['nav_doc', 'footer_doc']);

describe('clone_subtree_with_new_ids', () => {
	it('gives every copied node a fresh id', () => {
		const nodes = make_page_nodes();
		const result = clone_subtree_with_new_ids(
			'page_1',
			nodes,
			make_id_generator(),
			document_schema,
			shared_roots
		);

		const source_ids = Object.keys(nodes);
		const cloned_ids = Object.keys(result.nodes);

		expect(cloned_ids).toHaveLength(source_ids.length);
		for (const id of cloned_ids) {
			expect(source_ids).not.toContain(id);
		}
		// The stored key and the node's own id agree.
		for (const [id, node] of Object.entries(result.nodes)) {
			expect((node as any).id).toBe(id);
		}
	});

	it('rewrites node and node_array references to the copies', () => {
		const nodes = make_page_nodes();
		const result = clone_subtree_with_new_ids(
			'page_1',
			nodes,
			make_id_generator(),
			document_schema,
			shared_roots
		);

		const page = result.nodes[result.root_id] as any;
		const prose_id = page.body.nodes[0];
		const prose = result.nodes[prose_id] as any;

		expect(result.nodes[page.image]).toBeDefined();
		expect(prose).toBeDefined();
		expect(result.nodes[prose.body.nodes[0]]).toBeDefined();
	});

	it('rewrites mark references inside annotated text', () => {
		const nodes = make_page_nodes();
		const result = clone_subtree_with_new_ids(
			'page_1',
			nodes,
			make_id_generator(),
			document_schema,
			shared_roots
		);

		const page = result.nodes[result.root_id] as any;
		const prose = result.nodes[page.body.nodes[0]] as any;
		const heading = result.nodes[prose.body.nodes[0]] as any;
		const link_id = heading.content.marks[0].node_id;

		expect(link_id).not.toBe('link_1');
		expect(result.nodes[link_id]).toBeDefined();
		expect((result.nodes[link_id] as any).type).toBe('link');
	});

	it('leaves excluded shared roots pointing at their own documents', () => {
		const nodes = make_page_nodes();
		const result = clone_subtree_with_new_ids(
			'page_1',
			nodes,
			make_id_generator(),
			document_schema,
			shared_roots
		);

		const page = result.nodes[result.root_id] as any;
		expect(page.nav).toBe('nav_doc');
		expect(page.footer).toBe('footer_doc');
		expect(result.nodes.nav_doc).toBeUndefined();
		expect(result.nodes.footer_doc).toBeUndefined();
	});

	it('leaves the source document untouched', () => {
		const nodes = make_page_nodes();
		const before = structuredClone(nodes);
		clone_subtree_with_new_ids('page_1', nodes, make_id_generator(), document_schema, shared_roots);
		expect(nodes).toEqual(before);
	});
});
