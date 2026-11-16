import type { PageSummary, PageTreeNode } from '#app/page_browser_data.js';

/**
 * Place every page once, under the first page found to link to it, level by level. Roots are
 * placed one after another, so unlisted roots only get pages Home's tree does not reach. A root's
 * weak links (Home's body teasers) place a page only if nothing else in its tree links to it.
 */
export function build_page_forest(
	root_ids: string[],
	summaries_by_id: Map<string, PageSummary>,
	refs_by_page_id: Map<string, string[]>,
	weak_refs_by_root_id: Map<string, Set<string>> = new Map()
): PageTreeNode[] {
	const forest: PageTreeNode[] = [];
	const assigned_ids = new Set<string>();
	const queue: PageTreeNode[] = [];
	let next = 0;

	function add_page(document_id: string, siblings: PageTreeNode[]) {
		if (assigned_ids.has(document_id)) return;
		const summary = summaries_by_id.get(document_id);
		if (!summary) return;
		const node = { ...summary, children: [] };
		assigned_ids.add(document_id);
		siblings.push(node);
		queue.push(node);
	}

	// Assign all pages at each depth before following deeper links. Equal-depth
	// links keep the first parent in reference order.
	function place_linked_pages() {
		while (next < queue.length) {
			const node = queue[next++];
			const weak_ids = weak_refs_by_root_id.get(node.document_id);
			for (const target_id of refs_by_page_id.get(node.document_id) ?? []) {
				if (!weak_ids?.has(target_id)) add_page(target_id, node.children);
			}
		}
	}

	for (const root_id of root_ids) {
		add_page(root_id, forest);
		place_linked_pages();
		const root = forest.at(-1);
		const weak_ids = weak_refs_by_root_id.get(root_id);
		if (root?.document_id !== root_id || !weak_ids) continue;
		// One at a time, so a weak link's own links can claim later weak links' pages.
		for (const target_id of weak_ids) {
			add_page(target_id, root.children);
			place_linked_pages();
		}
		const refs = refs_by_page_id.get(root_id) ?? [];
		root.children.sort((a, b) => refs.indexOf(a.document_id) - refs.indexOf(b.document_id));
	}

	return forest;
}
