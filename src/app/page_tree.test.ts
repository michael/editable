import { describe, expect, it } from 'vitest';
import { build_page_forest } from './page_tree.js';
import type { PageSummary, PageTreeNode } from './api.remote.js';

function build_tree(root_ids: string[], links: Record<string, string[]>) {
	const summaries = new Map<string, PageSummary>(
		Object.keys(links).map((document_id) => [
			document_id,
			{
				document_id,
				title: document_id,
				description: null,
				preview_media_node: null,
				page_href: `/${document_id}`,
				slug: document_id,
				shadowed_by_markdown: false,
				created_at: null,
				updated_at: null
			}
		])
	);
	function outline(nodes: PageTreeNode[]): unknown {
		return nodes.map((node) => [node.document_id, outline(node.children)]);
	}
	return outline(build_page_forest(root_ids, summaries, new Map(Object.entries(links))));
}

describe('build_page_forest', () => {
	it('places a shared page under Home even when a deeper link occurs first', () => {
		expect(
			build_tree(['home'], {
				home: ['projects', 'contact'],
				projects: ['house'],
				house: ['contact'],
				contact: ['details'],
				details: []
			})
		).toEqual([
			[
				'home',
				[
					['projects', [['house', []]]],
					['contact', [['details', []]]]
				]
			]
		]);
	});

	it('uses the shallowest parent across branches and roots', () => {
		expect(
			build_tree(['home', 'other'], {
				home: ['projects'],
				projects: ['contact'],
				other: ['contact'],
				contact: []
			})
		).toEqual([
			['home', [['projects', []]]],
			['other', [['contact', []]]]
		]);
	});

	it('preserves link order for equal depths and ignores cycles, duplicates and missing pages', () => {
		expect(
			build_tree(['home'], {
				home: ['first', 'second', 'first', 'missing', 'home'],
				first: ['shared'],
				second: ['shared'],
				shared: ['home', 'first']
			})
		).toEqual([
			[
				'home',
				[
					['first', [['shared', []]]],
					['second', []]
				]
			]
		]);
	});
});
