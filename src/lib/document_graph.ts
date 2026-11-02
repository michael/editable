import type { Attachment, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';

export function get_attached_ranges(
	value: { marks?: Attachment[]; annotations?: Attachment[] } | null | undefined
): Attachment[] {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

/**
 * Deep-copy the subtree rooted at `root_id`, giving every copied node a fresh id
 * and rewriting the references between them.
 *
 * Ids outside the copied set are left untouched, so references that point at
 * other documents — a page's shared `banner`, `nav` and `footer` — keep pointing there.
 * Pass those roots in `exclude_roots` so they are not treated as part of the
 * subtree; they live in their own documents and must not be duplicated.
 */
export function clone_subtree_with_new_ids(
	root_id: string,
	nodes: Record<string, DocumentNode>,
	generate_id: () => string,
	schema: Record<string, NodeSchema>,
	exclude_roots?: Set<string>
): { root_id: string; nodes: Record<string, DocumentNode> } {
	const source_ids = collect_node_ids_in_order(root_id, nodes, schema, exclude_roots);

	const id_map = new Map<string, string>();
	for (const id of source_ids) {
		if (nodes[id]) id_map.set(id, generate_id());
	}

	const map_id = (id: string) => id_map.get(id) ?? id;
	const cloned_nodes: Record<string, DocumentNode> = {};

	for (const [source_id, new_id] of id_map) {
		const node = structuredClone(nodes[source_id]);
		node.id = new_id;

		const type_schema: NodeSchema | undefined = schema[node.type];

		for (const [prop_name, prop_def] of Object.entries<PropertyDefinition>(
			type_schema?.properties ?? {}
		)) {
			const value = node[prop_name];
			if (value == null) continue;

			if (prop_def.type === 'node' && typeof value === 'string') {
				node[prop_name] = map_id(value);
			} else if (prop_def.type === 'node_array') {
				value.nodes = value.nodes.map(map_id);
				remap_attached_ranges(value, map_id);
			} else if (prop_def.type === 'text') {
				remap_attached_ranges(value, map_id);
			}
		}

		cloned_nodes[new_id] = node;
	}

	return { root_id: map_id(root_id), nodes: cloned_nodes };
}

function remap_attached_ranges(
	value: { marks?: Attachment[]; annotations?: Attachment[] },
	map_id: (id: string) => string
) {
	for (const range of get_attached_ranges(value)) {
		if (range.node_id) {
			range.node_id = map_id(range.node_id);
		}
	}
}

/**
 * Collect all node ids reachable from a root node by walking node/node_array
 * properties and mark/annotation references, preserving first-seen traversal order.
 */
export function collect_node_ids_in_order(
	root_id: string,
	nodes: Record<string, DocumentNode>,
	schema: Record<string, NodeSchema>,
	exclude_roots?: Set<string>
): string[] {
	const collected: string[] = [];
	const seen_ids = new Set<string>();
	const stack: string[] = [root_id];

	while (stack.length > 0) {
		const id = stack.pop();
		if (!id || seen_ids.has(id)) continue;
		if (exclude_roots && exclude_roots.has(id) && id !== root_id) continue;

		seen_ids.add(id);
		collected.push(id);

		const node = nodes[id];
		if (!node) continue;

		const type_schema: NodeSchema | undefined = schema[node.type];
		if (!type_schema) continue;

		const next_ids: string[] = [];

		for (const [prop_name, prop_def] of Object.entries<PropertyDefinition>(
			type_schema.properties
		)) {
			const value = node[prop_name];
			if (value == null) continue;

			if (prop_def.type === 'node' && typeof value === 'string') {
				next_ids.push(value);
			} else if (prop_def.type === 'node_array') {
				for (const child_id of value.nodes) {
					next_ids.push(child_id);
				}
				for (const range of get_attached_ranges(value)) {
					if (range.node_id) {
						next_ids.push(range.node_id);
					}
				}
			} else if (prop_def.type === 'text') {
				for (const range of get_attached_ranges(value)) {
					if (range.node_id) {
						next_ids.push(range.node_id);
					}
				}
			}
		}

		for (let i = next_ids.length - 1; i >= 0; i -= 1) {
			stack.push(next_ids[i]);
		}
	}

	return collected;
}
