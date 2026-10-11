/**
 * EDF, the Editable document format: an XML projection of a Svedit document
 * for agents and humans. Node elements carry primitive properties as
 * attributes and text, node, and node_array properties as child elements.
 * Marks and annotations are inline elements in text and wrapper elements in
 * node arrays, so no offsets or range ids appear. Parsing yields the same
 * document JSON the editor stores; it is a transport encoding, not a model.
 *
 *   <page id="about">
 *     <title>About <strong>us</strong></title>
 *     <body>
 *       <section>
 *         <prose id="p1" layout="narrow-left">
 *           <body><paragraph id="t1">Hello <link href="/">home</link></paragraph></body>
 *         </prose>
 *       </section>
 *     </body>
 *   </page>
 */
import type { Attachment, Document, DocumentNode, NodeSchema, PropertyDefinition } from 'svedit';
import { get_property_default } from 'svedit';

type Schema = Record<string, NodeSchema>;
type Ranges = { marks?: Attachment[]; annotations?: Attachment[] };

/** Properties written as attributes: everything but text, node, and node_array. */
const is_attribute_type = (type: string) => !['text', 'node', 'node_array'].includes(type);

export class EdfError extends Error {}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const graphemes = (text: string) => [...segmenter.segment(text)].map((s) => s.segment);

// ---------------------------------------------------------------------------
// XML subset: elements, attributes, text, entities, and comments.

type XmlText = { kind: 'text'; text: string; line: number };
type XmlElement = {
	kind: 'element';
	name: string;
	attributes: Record<string, string>;
	children: (XmlElement | XmlText)[];
	line: number;
};

const NAMED_ENTITIES: Record<string, string> = {
	lt: '<',
	gt: '>',
	amp: '&',
	quot: '"',
	apos: "'"
};

function escape_text(value: string) {
	return value.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
}

function escape_attribute(value: string) {
	return value.replace(
		/[<>&"\n\t]/g,
		(c) =>
			({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\n': '&#10;', '\t': '&#9;' })[c]!
	);
}

function decode(value: string, line: number) {
	return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);?/g, (match, entity: string) => {
		if (!match.endsWith(';')) throw new EdfError(`Line ${line}: unterminated entity ${match}.`);
		if (entity[0] === '#') {
			const code = entity[1] === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1));
			return String.fromCodePoint(code);
		}
		if (!(entity in NAMED_ENTITIES))
			throw new EdfError(`Line ${line}: unknown entity ${match}. Write & as &amp;.`);
		return NAMED_ENTITIES[entity];
	});
}

function parse_xml(source: string): XmlElement {
	const newline_positions: number[] = [];
	for (let i = source.indexOf('\n'); i >= 0; i = source.indexOf('\n', i + 1))
		newline_positions.push(i);
	const line_at = (index: number) => {
		let low = 0;
		let high = newline_positions.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (newline_positions[mid] < index) low = mid + 1;
			else high = mid;
		}
		return low + 1;
	};

	const open_tag = /<([A-Za-z_][\w.-]*)/y;
	const close_tag = /<\/([A-Za-z_][\w.-]*)\s*>/y;
	const attribute = /\s*([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
	const tag_end = /\s*(\/?)>/y;
	const stack: XmlElement[] = [];
	let root: XmlElement | null = null;
	let i = 0;

	const attach = (node: XmlElement | XmlText) => {
		const parent = stack.at(-1);
		if (parent) parent.children.push(node);
		else if (node.kind === 'element') {
			if (root) throw new EdfError(`Line ${node.line}: only one root element is allowed.`);
			root = node;
		} else if (node.text.trim()) {
			throw new EdfError(`Line ${node.line}: text outside the root element.`);
		}
	};

	while (i < source.length) {
		if (source[i] !== '<') {
			const end = source.indexOf('<', i);
			const stop = end < 0 ? source.length : end;
			attach({ kind: 'text', text: decode(source.slice(i, stop), line_at(i)), line: line_at(i) });
			i = stop;
			continue;
		}
		const line = line_at(i);
		if (source.startsWith('<!--', i)) {
			const end = source.indexOf('-->', i);
			if (end < 0) throw new EdfError(`Line ${line}: unterminated comment.`);
			i = end + 3;
			continue;
		}
		if (source.startsWith('<?', i)) {
			const end = source.indexOf('?>', i);
			if (end < 0) throw new EdfError(`Line ${line}: unterminated processing instruction.`);
			i = end + 2;
			continue;
		}
		if (source[i + 1] === '/') {
			close_tag.lastIndex = i;
			const match = close_tag.exec(source);
			if (!match) throw new EdfError(`Line ${line}: malformed closing tag.`);
			const open = stack.pop();
			if (!open) throw new EdfError(`Line ${line}: </${match[1]}> has no opening tag.`);
			if (open.name !== match[1])
				throw new EdfError(
					`Line ${line}: </${match[1]}> does not close <${open.name}> from line ${open.line}.`
				);
			i = close_tag.lastIndex;
			continue;
		}
		open_tag.lastIndex = i;
		const match = open_tag.exec(source);
		if (!match) throw new EdfError(`Line ${line}: expected a tag name after <.`);
		const element: XmlElement = {
			kind: 'element',
			name: match[1],
			attributes: {},
			children: [],
			line
		};
		i = open_tag.lastIndex;
		for (;;) {
			attribute.lastIndex = i;
			const attr = attribute.exec(source);
			if (!attr) break;
			if (attr[1] in element.attributes)
				throw new EdfError(`Line ${line}: duplicate attribute ${attr[1]} on <${element.name}>.`);
			element.attributes[attr[1]] = decode(attr[2] ?? attr[3] ?? '', line);
			i = attribute.lastIndex;
		}
		tag_end.lastIndex = i;
		const end = tag_end.exec(source);
		if (!end)
			throw new EdfError(`Line ${line}: expected attribute="value", > or /> in <${element.name}>.`);
		i = tag_end.lastIndex;
		attach(element);
		if (!end[1]) stack.push(element);
	}
	const unclosed = stack.at(-1);
	if (unclosed) throw new EdfError(`Line ${unclosed.line}: <${unclosed.name}> is never closed.`);
	if (!root) throw new EdfError('The document is empty.');
	return root;
}

// ---------------------------------------------------------------------------
// Shared helpers

function ranges_of(value: Ranges | null | undefined): Attachment[] {
	return [...(value?.marks ?? []), ...(value?.annotations ?? [])];
}

/**
 * Visit a range of positions, emitting plain stretches and wrappers for the
 * ranges inside them. Ranges may nest but not partially overlap.
 */
function walk_ranges(
	start: number,
	end: number,
	ranges: Attachment[],
	plain: (start: number, end: number) => void,
	wrap: (range: Attachment, inner: () => void) => void,
	describe: () => string
) {
	const sorted = [...ranges].sort(
		(a, b) => a.start_offset - b.start_offset || b.end_offset - a.end_offset
	);
	let position = start;
	let i = 0;
	while (i < sorted.length) {
		const range = sorted[i];
		if (range.start_offset < position)
			throw new EdfError(`${describe()} has overlapping ranges, which EDF cannot express.`);
		plain(position, range.start_offset);
		let j = i + 1;
		while (j < sorted.length && sorted[j].start_offset < range.end_offset) {
			if (sorted[j].end_offset > range.end_offset)
				throw new EdfError(`${describe()} has overlapping ranges, which EDF cannot express.`);
			j++;
		}
		const inner = sorted.slice(i + 1, j);
		wrap(range, () =>
			walk_ranges(range.start_offset, range.end_offset, inner, plain, wrap, describe)
		);
		position = range.end_offset;
		i = j;
	}
	plain(position, end);
}

function primitive_to_string(value: unknown) {
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function primitive_from_string(definition: PropertyDefinition, value: string, where: string) {
	const fail = (expected: string) => new EdfError(`${where} must be ${expected}, got "${value}".`);
	switch (definition.type) {
		case 'string':
		case 'datetime':
			return value;
		case 'integer':
			if (!/^-?\d+$/.test(value)) throw fail('an integer');
			return parseInt(value);
		case 'number':
			if (!value.trim() || Number.isNaN(Number(value))) throw fail('a number');
			return Number(value);
		case 'boolean':
			if (value !== 'true' && value !== 'false') throw fail('true or false');
			return value === 'true';
		default: {
			let parsed: unknown;
			try {
				parsed = JSON.parse(value);
			} catch {
				throw fail('a JSON array');
			}
			if (!Array.isArray(parsed)) throw fail('a JSON array');
			return parsed;
		}
	}
}

function is_default(definition: PropertyDefinition, value: unknown) {
	return JSON.stringify(value) === JSON.stringify(get_property_default(definition));
}

/**
 * Text nodes whose only structured property is their content keep it inline,
 * like HTML: <paragraph id="p">Hello <strong>world</strong></paragraph>.
 */
function has_inline_content(type_schema: NodeSchema) {
	return (
		type_schema.kind === 'text' &&
		Object.entries<PropertyDefinition>(type_schema.properties).every(([name, definition]) =>
			name === 'content' ? definition.type === 'text' : is_attribute_type(definition.type)
		)
	);
}

// ---------------------------------------------------------------------------
// Serialize

export type SerializeOptions = {
	/** Node ids to leave out, written as id references instead, e.g. shared nav and footer. */
	exclude?: Iterable<string>;
};

export function serialize_edf(document: Document, schema: Schema, options: SerializeOptions = {}) {
	const exclude = new Set(options.exclude ?? []);
	const { nodes } = document;
	const lines: string[] = [];
	const root = nodes[document.document_id];
	if (!root) throw new EdfError(`Root node ${document.document_id} is missing.`);

	const node_schema = (node: DocumentNode) => {
		const type_schema = schema[node.type];
		if (!type_schema) throw new EdfError(`Node ${node.id} has unknown type ${node.type}.`);
		return type_schema;
	};

	/** Attributes of a node: its id, then primitive properties that differ from their default. */
	const attributes = (node: DocumentNode, with_id: boolean) => {
		const parts = with_id ? [` id="${escape_attribute(node.id)}"`] : [];
		for (const [name, definition] of Object.entries<PropertyDefinition>(
			node_schema(node).properties
		)) {
			const value = node[name];
			if (!is_attribute_type(definition.type) || value === undefined) continue;
			if (is_default(definition, value)) continue;
			parts.push(` ${name}="${escape_attribute(primitive_to_string(value))}"`);
		}
		return parts.join('');
	};

	const range_node = (range: Attachment, where: string) => {
		const node = nodes[range.node_id];
		if (!node) throw new EdfError(`${where} references missing node ${range.node_id}.`);
		return node;
	};

	const inline_text = (node: DocumentNode, name: string, value: Ranges & { content: string }) => {
		const chars = graphemes(value.content);
		let out = '';
		walk_ranges(
			0,
			chars.length,
			ranges_of(value),
			(start, end) => (out += escape_text(chars.slice(start, end).join(''))),
			(range, inner) => {
				const mark = range_node(range, `${node.id}.${name}`);
				out += `<${mark.type}${attributes(mark, false)}>`;
				inner();
				out += `</${mark.type}>`;
			},
			() => `${node.id}.${name}`
		);
		return out;
	};

	const write_array = (
		node: DocumentNode,
		name: string,
		value: Ranges & { nodes: string[] },
		depth: number
	) => {
		// Wrappers for ranges nest, so the indentation follows the current range depth.
		let current_depth = depth;
		walk_ranges(
			0,
			value.nodes.length,
			ranges_of(value),
			(start, end) => {
				for (const id of value.nodes.slice(start, end)) {
					const child = nodes[id];
					if (!child) throw new EdfError(`${node.id}.${name} references missing node ${id}.`);
					write_node(child, current_depth);
				}
			},
			(range, inner) => {
				const mark = range_node(range, `${node.id}.${name}`);
				lines.push(`${'\t'.repeat(current_depth)}<${mark.type}${attributes(mark, false)}>`);
				current_depth += 1;
				inner();
				current_depth -= 1;
				lines.push(`${'\t'.repeat(current_depth)}</${mark.type}>`);
			},
			() => `${node.id}.${name}`
		);
	};

	function write_node(node: DocumentNode, depth: number) {
		const indent = '\t'.repeat(depth);
		const open = `${indent}<${node.type}${attributes(node, true)}`;
		if (has_inline_content(node_schema(node))) {
			const text = node.content ? inline_text(node, 'content', node.content) : '';
			lines.push(text ? `${open}>${text}</${node.type}>` : `${open}/>`);
			return;
		}
		const start = lines.length;
		lines.push(open);
		let references = '';
		for (const [name, definition] of Object.entries<PropertyDefinition>(
			node_schema(node).properties
		)) {
			const value = node[name];
			if (value === undefined || value === null || is_attribute_type(definition.type)) continue;
			if (definition.type === 'node') {
				const child = nodes[value];
				if (!child || exclude.has(value)) {
					references += ` ${name}="${escape_attribute(value)}"`;
					continue;
				}
				lines.push(`${indent}\t<${name}>`);
				write_node(child, depth + 2);
				lines.push(`${indent}\t</${name}>`);
			} else if (definition.type === 'text') {
				if (!value.content && !ranges_of(value).length) continue;
				lines.push(`${indent}\t<${name}>${inline_text(node, name, value)}</${name}>`);
			} else if (definition.type === 'node_array') {
				if (!value.nodes.length && !ranges_of(value).length) continue;
				lines.push(`${indent}\t<${name}>`);
				write_array(node, name, value, depth + 2);
				lines.push(`${indent}\t</${name}>`);
			}
		}
		if (lines.length === start + 1) lines[start] = `${open}${references}/>`;
		else {
			lines[start] = `${open}${references}>`;
			lines.push(`${indent}</${node.type}>`);
		}
	}

	write_node(root, 0);
	return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Parse

export type ParseOptions = {
	/** Previously stored nodes, used to keep the ids of unchanged marks and annotations. */
	stored?: Record<string, DocumentNode>;
	/** Id generator for nodes without an id attribute. */
	generate_id?: () => string;
};

type PendingRange = {
	owner: DocumentNode;
	property: string;
	node: DocumentNode;
	range: Attachment;
};

export function parse_edf(source: string, schema: Schema, options: ParseOptions = {}): Document {
	const stored = options.stored ?? {};
	const generate_id = options.generate_id ?? (() => `n${Math.random().toString(36).slice(2, 12)}`);
	const nodes: Record<string, DocumentNode> = {};
	const pending: PendingRange[] = [];

	const type_schema = (element: XmlElement) => {
		const type_schema = schema[element.name];
		if (!type_schema)
			throw new EdfError(`Line ${element.line}: unknown node type <${element.name}>.`);
		return type_schema;
	};

	const property_definition = (element: XmlElement, name: string, line: number) => {
		const definition: PropertyDefinition | undefined = type_schema(element).properties[name];
		if (!definition)
			throw new EdfError(
				`Line ${line}: <${element.name}> has no property "${name}". Properties: ${Object.keys(type_schema(element).properties).join(', ')}.`
			);
		return definition;
	};

	/** Primitive properties come from attributes; node references may too. */
	const node_from_attributes = (element: XmlElement, with_id: boolean) => {
		const node: DocumentNode = {
			id: with_id ? (element.attributes.id ?? generate_id()) : '',
			type: element.name
		};
		type_schema(element);
		for (const [name, raw] of Object.entries(element.attributes)) {
			if (name === 'id') {
				if (!with_id)
					throw new EdfError(`Line ${element.line}: <${element.name}> is a mark and takes no id.`);
				continue;
			}
			const definition = property_definition(element, name, element.line);
			const where = `Line ${element.line}: ${element.name}.${name}`;
			if (is_attribute_type(definition.type))
				node[name] = primitive_from_string(definition, raw, where);
			else if (definition.type === 'node') node[name] = raw;
			else
				throw new EdfError(
					`${where} is a ${definition.type} property and must be a child element, not an attribute.`
				);
		}
		return node;
	};

	const only_elements = (element: XmlElement, context: string) => {
		const elements: XmlElement[] = [];
		for (const child of element.children) {
			if (child.kind === 'element') elements.push(child);
			else if (child.text.trim())
				throw new EdfError(`Line ${child.line}: text is not allowed ${context}.`);
		}
		return elements;
	};

	const parse_text = (owner: DocumentNode, name: string, element: XmlElement, definition: any) => {
		const allowed = {
			marks: new Set<string>(definition.mark_types ?? []),
			annotations: new Set<string>(definition.annotation_types ?? [])
		};
		const value = { content: '', marks: [] as Attachment[], annotations: [] as Attachment[] };
		let length = 0;
		for (const child of element.children) {
			if (child.kind === 'text') {
				value.content += child.text;
				length += graphemes(child.text).length;
				continue;
			}
			const kind = allowed.marks.has(child.name)
				? 'marks'
				: allowed.annotations.has(child.name)
					? 'annotations'
					: null;
			if (!kind)
				throw new EdfError(
					`Line ${child.line}: <${child.name}> is not allowed in ${owner.type}.${name}. Allowed: ${[...allowed.marks, ...allowed.annotations].join(', ') || 'none'}.`
				);
			const node = node_from_attributes(child, false);
			const start = length;
			for (const inner of child.children) {
				if (inner.kind === 'element')
					throw new EdfError(
						`Line ${inner.line}: <${inner.name}> inside <${child.name}> — marks cannot be nested.`
					);
				value.content += inner.text;
				length += graphemes(inner.text).length;
			}
			const range = { start_offset: start, end_offset: length, node_id: '' };
			value[kind].push(range);
			pending.push({ owner, property: name, node, range });
		}
		return value;
	};

	const parse_array = (owner: DocumentNode, name: string, element: XmlElement, definition: any) => {
		const allowed = {
			marks: new Set<string>(definition.mark_types ?? []),
			annotations: new Set<string>(definition.annotation_types ?? [])
		};
		const node_types = new Set<string>(definition.node_types);
		const value = {
			nodes: [] as string[],
			marks: [] as Attachment[],
			annotations: [] as Attachment[]
		};
		const visit = (parent: XmlElement) => {
			for (const child of only_elements(parent, `in ${owner.type}.${name}`)) {
				if (node_types.has(child.name)) {
					value.nodes.push(parse_node(child).id);
					continue;
				}
				const kind = allowed.marks.has(child.name)
					? 'marks'
					: allowed.annotations.has(child.name)
						? 'annotations'
						: null;
				if (!kind)
					throw new EdfError(
						`Line ${child.line}: <${child.name}> is not allowed in ${owner.type}.${name}. Allowed: ${[...node_types, ...allowed.marks, ...allowed.annotations].join(', ')}.`
					);
				const node = node_from_attributes(child, false);
				const start = value.nodes.length;
				visit(child);
				const range = { start_offset: start, end_offset: value.nodes.length, node_id: '' };
				value[kind].push(range);
				pending.push({ owner, property: name, node, range });
			}
		};
		visit(element);
		return value;
	};

	function parse_node(element: XmlElement): DocumentNode {
		const node = node_from_attributes(element, true);
		if (node.id in nodes) throw new EdfError(`Line ${element.line}: duplicate node id ${node.id}.`);
		nodes[node.id] = node;
		const schema_of = type_schema(element);
		// Inline content, unless the children spell out properties explicitly.
		if (
			has_inline_content(schema_of) &&
			!element.children.some(
				(child) => child.kind === 'element' && child.name in schema_of.properties
			)
		) {
			node.content = parse_text(node, 'content', element, schema_of.properties.content);
			return node;
		}
		for (const child of only_elements(element, `directly inside <${element.name}>`)) {
			const name = child.name;
			const definition = property_definition(element, name, child.line);
			if (name in node)
				throw new EdfError(`Line ${child.line}: ${element.name}.${name} is set twice.`);
			if (definition.type === 'text') node[name] = parse_text(node, name, child, definition);
			else if (definition.type === 'node_array')
				node[name] = parse_array(node, name, child, definition);
			else if (definition.type === 'node') {
				const children = only_elements(child, `in ${element.name}.${name}`);
				if (children.length !== 1)
					throw new EdfError(
						`Line ${child.line}: ${element.name}.${name} must contain exactly one node element.`
					);
				node[name] = parse_node(children[0]).id;
			} else
				throw new EdfError(
					`Line ${child.line}: ${element.name}.${name} is a ${definition.type} and belongs in an attribute.`
				);
		}
		return node;
	}

	const root = parse_xml(source);
	parse_node(root);
	assign_range_ids(pending, nodes, stored, schema, generate_id);
	return { document_id: root_id(root), nodes };
}

function root_id(root: XmlElement) {
	if (!root.attributes.id)
		throw new EdfError(`Line ${root.line}: the root <${root.name}> needs an id attribute.`);
	return root.attributes.id;
}

/** The document id of an EDF document, without interpreting it against a schema. */
export function edf_root_id(source: string) {
	return root_id(parse_xml(source));
}

/**
 * Marks and annotations carry no ids in EDF. Reuse the stored id of a range
 * with the same type and properties on the same property, preferring equal
 * offsets, so unchanged formatting keeps its identity.
 */
function assign_range_ids(
	pending: PendingRange[],
	nodes: Record<string, DocumentNode>,
	stored: Record<string, DocumentNode>,
	schema: Schema,
	generate_id: () => string
) {
	const used = new Set<string>();
	const signature = (node: DocumentNode) => {
		const properties = schema[node.type]?.properties ?? {};
		const values = Object.entries<PropertyDefinition>(properties).map(([name, definition]) => [
			name,
			node[name] ?? get_property_default(definition)
		]);
		return JSON.stringify([node.type, values]);
	};
	for (const { owner, property, node, range } of pending) {
		const candidates = ranges_of(stored[owner.id]?.[property])
			.map((stored_range) => ({ stored_range, stored_node: stored[stored_range.node_id] }))
			.filter(
				({ stored_range, stored_node }) =>
					stored_node &&
					!used.has(stored_range.node_id) &&
					!(stored_range.node_id in nodes) &&
					signature(stored_node) === signature(node)
			);
		const match =
			candidates.find(
				({ stored_range }) =>
					stored_range.start_offset === range.start_offset &&
					stored_range.end_offset === range.end_offset
			) ?? candidates[0];
		node.id = match ? match.stored_range.node_id : generate_id();
		used.add(node.id);
		range.node_id = node.id;
		nodes[node.id] = node;
	}
}
