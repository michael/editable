import type { PageSummary, PageTreeNode } from '#app/api.remote.js';

export function build_page_forest(
	root_ids: string[],
	summaries_by_id: Map<string, PageSummary>,
	refs_by_page_id: Map<string, string[]>
): PageTreeNode[] {
	const forest: PageTreeNode[] = [];
	const assigned_ids = new Set<string>();
	const queue: PageTreeNode[] = [];

	function add_page(document_id: string, siblings: PageTreeNode[]) {
		if (assigned_ids.has(document_id)) return;
		const summary = summaries_by_id.get(document_id);
		if (!summary) return;
		const node = { ...summary, children: [] };
		assigned_ids.add(document_id);
		siblings.push(node);
		queue.push(node);
	}

	for (const root_id of root_ids) add_page(root_id, forest);

	// Assign all pages at each depth before following deeper links. Equal-depth
	// links keep the first parent in root and reference order.
	for (const node of queue) {
		for (const target_id of refs_by_page_id.get(node.document_id) ?? []) {
			add_page(target_id, node.children);
		}
	}

	return forest;
}
