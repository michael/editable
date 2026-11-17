import { describe, expect, it } from 'vitest';
import { build_page_forest } from './page_tree.js';
import type { PageSummary, PageTreeNode } from './page_browser_data.js';

function build_tree(
	root_ids: string[],
	links: Record<string, string[]>,
	weak_links: Record<string, string[]> = {}
) {
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
				shadowed_by_language: false,
				created_at: null,
				updated_at: null
			}
		])
	);
	function outline(nodes: PageTreeNode[]): unknown {
		return nodes.map((node) => [node.document_id, outline(node.children)]);
	}
	const weak = new Map(Object.entries(weak_links).map(([id, ids]) => [id, new Set(ids)]));
	return outline(build_page_forest(root_ids, summaries, new Map(Object.entries(links)), weak));
}

describe('build_page_forest', () => {
	it('with only Home as a root, excludes unlisted pages and disconnected cycles', () => {
		expect(
			build_tree(['home'], {
				home: ['listed'],
				listed: ['nested'],
				nested: ['home'],
				unlisted: ['nested', 'private'],
				private: [],
				cycle_a: ['cycle_b'],
				cycle_b: ['cycle_a']
			})
		).toEqual([['home', [['listed', [['nested', []]]]]]]);
	});

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

	it("completes Home's tree before unlisted roots claim pages", () => {
		expect(
			build_tree(['home', 'other'], {
				home: ['projects'],
				projects: ['contact'],
				other: ['contact', 'draft'],
				contact: [],
				draft: []
			})
		).toEqual([
			['home', [['projects', [['contact', []]]]]],
			['other', [['draft', []]]]
		]);
	});

	it("places Home's weak links under any other page linking them, keeping Home's link order", () => {
		expect(
			build_tree(
				['home', 'backup'],
				{
					home: ['blog', 'post', 'teaser', 'nested', 'imprint'],
					blog: ['post'],
					teaser: ['nested'],
					post: [],
					nested: [],
					imprint: [],
					backup: ['teaser']
				},
				{ home: ['post', 'teaser', 'nested'] }
			)
		).toEqual([
			[
				'home',
				[
					['blog', [['post', []]]],
					['teaser', [['nested', []]]],
					['imprint', []]
				]
			],
			['backup', []]
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
