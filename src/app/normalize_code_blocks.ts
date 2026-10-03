import type { Document } from 'svedit';

// Older browser drafts can outlive the database migration.
export function normalize_code_blocks(doc: Document): Document {
	const legacy_nodes = Object.values(doc.nodes).filter((node) => node.type === 'preformatted');
	if (legacy_nodes.length === 0) return doc;
	const nodes = { ...doc.nodes };
	for (const node of legacy_nodes) {
		nodes[node.id] = { ...node, type: 'code_block', layout: 'plain' };
	}
	return { ...doc, nodes };
}
