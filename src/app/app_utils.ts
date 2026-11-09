import { get_property_default } from 'svedit';
import type {
	Session,
	DocumentNode,
	DocumentPath,
	NodeSelection,
	PropertyDefinition
} from 'svedit';

/**
 * Build the full path from the document root to the current selection,
 * including the selected node index.
 *
 * For node selections the selected node index is the lower edge of a single-node
 * range. A collapsed node selection points at the node that owns the selected gap.
 * For text/property selections the path already contains all indices.
 */
function get_ancestor_walk_path(session: Session): DocumentPath | null {
	if (!session.selection) return null;

	if (session.selection.type === 'node') {
		const start = Math.min(session.selection.anchor_offset, session.selection.focus_offset);
		const end = Math.max(session.selection.anchor_offset, session.selection.focus_offset);
		if (end === start) {
			const owner_path = session.selection.path.slice(0, -1);
			return owner_path.length > 0 ? owner_path : null;
		}

		// Only walk from a single selected node. Multi-node selections do not
		// identify one unambiguous node whose type/layout should change.
		if (end - start !== 1) return null;

		return [...session.selection.path, start];
	}

	// Text/property selections inside a node, like ['page_1', 'body', 0, 'text']
	return session.selection.path.length > 3 ? session.selection.path : null;
}

/**
 * List the nodes on a path that sit in a node_array, innermost first. A node held
 * by a node property has no index, so the walk passes over it to the closest
 * node_array entry around it.
 */
function get_node_array_entries(
	session: Session,
	full_path: DocumentPath
): { node: DocumentNode; node_array_path: DocumentPath; node_index: number }[] {
	const entries = [];
	for (let i = full_path.length - 1; i >= 2; i -= 1) {
		const node_index = full_path[i];
		const node_array_path = full_path.slice(0, i);
		if (typeof node_index !== 'number') continue;
		if (session.inspect(node_array_path)?.type !== 'node_array') continue;
		const node = session.get([...node_array_path, node_index]);
		if (node) entries.push({ node, node_array_path, node_index });
	}
	return entries;
}

/**
 * Return a node selection of the closest node around the selection that sits in a
 * node_array, or null at the top. Unlike Svedit's select_parent(), this passes over
 * nodes held by node properties, which a node selection cannot point to.
 */
export function get_parent_selection(session: Session): NodeSelection | null {
	const path = session.selection?.path;
	const entry = path ? get_node_array_entries(session, path)[0] : null;
	if (!entry) return null;
	return {
		type: 'node',
		path: entry.node_array_path,
		anchor_offset: entry.node_index,
		focus_offset: entry.node_index + 1
	};
}

/**
 * Return the nodes between the document root and the current canonical selection.
 * The document node itself is normally omitted because it is editor infrastructure.
 * It is retained as the owning-node fallback for a collapsed top-level node gap.
 */
export function get_selection_node_ancestors(
	session: Session
): { node: DocumentNode; path: DocumentPath }[] {
	const full_path = get_ancestor_walk_path(session);
	if (!full_path) return [];
	const include_document =
		session.selection?.type === 'node' &&
		session.selection.anchor_offset === session.selection.focus_offset;

	const ancestors: { node: DocumentNode; path: DocumentPath }[] = [];
	for (let path_length = 1; path_length <= full_path.length; path_length += 1) {
		const path = full_path.slice(0, path_length);
		const node = session.get(path);
		if (!node || typeof node.type !== 'string' || !session.schema[node.type]) continue;
		if (session.schema[node.type].kind === 'document' && !include_document) continue;
		ancestors.push({ node, path });
	}

	return ancestors;
}

/**
 * Compare schema/value objects deeply. Object key order is ignored, array order is not.
 */
function are_values_equal(left: any, right: any): boolean {
	if (Object.is(left, right)) return true;
	if (typeof left !== typeof right) return false;
	if (left === null || right === null) return false;

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right)) return false;
		if (left.length !== right.length) return false;
		return left.every((value, index) => are_values_equal(value, right[index]));
	}

	if (typeof left === 'object') {
		const left_keys = Object.keys(left);
		const right_keys = Object.keys(right);
		if (left_keys.length !== right_keys.length) return false;
		return left_keys.every(
			(key) => Object.hasOwn(right, key) && are_values_equal(left[key], right[key])
		);
	}

	return false;
}

/**
 * Check if a primitive or custom extra value is empty without schema context.
 */
function is_empty_literal(value: any): boolean {
	if (value === undefined || value === null || value === '') return true;
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

/**
 * Check if a property value is empty/default, recursing through child nodes.
 */
function is_property_value_empty(
	session: Session,
	property_definition: PropertyDefinition,
	value: any
): boolean {
	if (property_definition.type === 'node') {
		if (is_empty_literal(value)) return true;
		const child_node = session.get(value);
		return child_node ? is_node_subtree_empty(session, child_node) : false;
	}

	if (property_definition.type === 'node_array') {
		if (!value?.nodes) return false;
		return value.nodes.every((node_id: string) => {
			const child_node = session.get(node_id);
			return child_node ? is_node_subtree_empty(session, child_node) : false;
		});
	}

	const property_default = get_property_default(property_definition);
	return are_values_equal(value, property_default) || is_empty_literal(value);
}

/**
 * Check whether a node and all descendants contain only empty/default values.
 */
export function is_node_subtree_empty(session: Session, node: DocumentNode): boolean {
	const node_schema = session.schema[node.type];
	if (!node_schema) return false;

	for (const [property_name, property_definition] of Object.entries<PropertyDefinition>(
		node_schema.properties
	)) {
		if (property_name === 'layout') continue;
		if (!is_property_value_empty(session, property_definition, node[property_name])) return false;
	}

	for (const property_name of Object.keys(node)) {
		if (property_name === 'id' || property_name === 'type') continue;
		if (Object.hasOwn(node_schema.properties, property_name)) continue;
		if (!is_empty_literal(node[property_name])) return false;
	}

	return true;
}

/**
 * Check whether two node types have exactly equivalent property schemas.
 */
function have_same_property_schema(
	schema: Record<string, any>,
	source_type: string,
	target_type: string
): boolean {
	const source_properties = schema[source_type]?.properties;
	const target_properties = schema[target_type]?.properties;
	return (
		!!source_properties &&
		!!target_properties &&
		are_values_equal(source_properties, target_properties)
	);
}

/**
 * Find the closest ancestor node whose type can be switched
 * (lives in a node_array with multiple node_types).
 */
function get_closest_switchable_type(
	session: Session
): { node: DocumentNode; node_array_path: DocumentPath; node_index: number } | null {
	const full_path = get_ancestor_walk_path(session);
	if (!full_path) return null;

	return (
		get_node_array_entries(session, full_path).find(
			({ node_array_path }) => session.inspect(node_array_path).node_types?.length > 1
		) ?? null
	);
}

/**
 * Get the current cycle node state, including compatible target types.
 */
export function get_cycle_node_state(session: Session): {
	node: DocumentNode;
	node_array_path: DocumentPath;
	node_index: number;
	available_types: string[];
} | null {
	const closest_switchable_type = get_closest_switchable_type(session);
	if (!closest_switchable_type) return null;

	const { node, node_array_path } = closest_switchable_type;
	const node_array_schema = session.inspect(node_array_path);
	const node_types = node_array_schema?.node_types ?? [];
	const current_type_index = node_types.indexOf(node.type);

	if (current_type_index === -1) {
		return { ...closest_switchable_type, available_types: [] };
	}

	const cycle_ordered_types = [
		...node_types.slice(current_type_index + 1),
		...node_types.slice(0, current_type_index)
	];
	const node_is_empty = is_node_subtree_empty(session, node);
	const available_types = node_is_empty
		? cycle_ordered_types
		: cycle_ordered_types.filter((node_type: string) =>
				have_same_property_schema(session.schema, node.type, node_type)
			);

	return { ...closest_switchable_type, available_types };
}

/**
 * Find the closest ancestor node whose layout can be switched
 * (has a layout property with more than one allowed value).
 */
export function get_closest_switchable_layout(
	session: Session
): { node: DocumentNode; node_array_path: DocumentPath; node_index: number } | null {
	const full_path = get_ancestor_walk_path(session);
	if (!full_path) return null;

	return (
		get_node_array_entries(session, full_path).find(({ node }) => {
			const layout_property = session.schema[node.type]?.properties?.layout;
			const layouts = layout_property?.type === 'string' ? layout_property.values : undefined;
			return node.layout && layouts?.length > 1;
		}) ?? null
	);
}
