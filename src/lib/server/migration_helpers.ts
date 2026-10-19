// Content helpers for migrations, so the common transformations work the same
// on every backend and do not have to be written against stored records.
//
// The helpers change the site's documents in memory: every helper scans all
// documents (pages, banner, nav, footer) and applies the change to matching
// nodes. Editable then saves the documents that changed. `updated_at` is left
// untouched: a migration is not a content edit.

import type { Document } from 'svedit';
import type { NewDocument } from './backend.js';

type MigrationNode = Record<string, unknown>;

/** A document as a migration sees it; one it added has no version yet. */
export type MigrationDocument = NewDocument & { version?: string };

export type MigrationHelpers = {
	update: (type: string, transform: (node: MigrationNode) => void) => number;
	rename_property: (type: string, from: string, to: string) => number;
	rename_type: (from: string, to: string) => number;
	replace_value: (type: string, property: string, from: unknown, to: unknown) => number;
	delete_property: (type: string, property: string) => number;
	ensure_document: (document: Document) => boolean;
};

/**
 * Build the helpers spread into every content migration's `up` context, over
 * the documents they change.
 */
export function create_migration_helpers(documents: MigrationDocument[]): MigrationHelpers {
	/**
	 * Apply `transform` to every node of `type` in every document. The transform
	 * mutates the node it is given; returns the number of nodes it changed.
	 */
	function update(type: string, transform: (node: MigrationNode) => void): number {
		let changed_nodes = 0;
		for (const record of documents) {
			for (const node of Object.values(record.data.nodes ?? {}) as MigrationNode[]) {
				if (!node || node.type !== type) continue;
				// Comparing serialized nodes keeps the transform a plain mutation
				// while still reporting accurate counts.
				const before = JSON.stringify(node);
				transform(node);
				if (JSON.stringify(node) !== before) changed_nodes += 1;
			}
		}
		return changed_nodes;
	}

	/**
	 * Rename a property on all nodes of one type, keeping its value as is.
	 * Nodes that never had the property are left alone.
	 */
	function rename_property(type: string, from: string, to: string): number {
		return update(type, (node) => {
			if (!(from in node)) return;
			if (to in node) {
				throw new Error(
					`Cannot rename ${type}.${from} to "${to}": node "${node.id}" already has that property.`
				);
			}

			// Reinsert every property so the renamed one keeps its position.
			const entries = Object.entries(node);
			for (const key of Object.keys(node)) delete node[key];
			for (const [key, value] of entries) {
				node[key === from ? to : key] = value;
			}
		});
	}

	/**
	 * Rename a node type on every node that has it. Document records also
	 * carry the type of their root node, which is kept in step.
	 */
	function rename_type(from: string, to: string): number {
		const changed_nodes = update(from, (node) => {
			node.type = to;
		});
		for (const record of documents) if (record.type === from) record.type = to;
		return changed_nodes;
	}

	/**
	 * Replace one property value with another on all nodes of one type, for
	 * example a renamed layout id. Matching is strict equality, so this is for
	 * primitive values.
	 */
	function replace_value(type: string, property: string, from: unknown, to: unknown): number {
		return update(type, (node) => {
			if (node[property] === from) node[property] = to;
		});
	}

	/**
	 * Drop a property from all nodes of one type. Stale properties are not
	 * removed by saving — nodes are stored as they are loaded — so this is how
	 * a property retired from the schema leaves stored content.
	 */
	function delete_property(type: string, property: string): number {
		return update(type, (node) => {
			delete node[property];
		});
	}

	/**
	 * Add a document unless one with its id exists, for example a new shared
	 * document every page refers to. Its type is its root node's. Returns
	 * whether it was added.
	 */
	function ensure_document(document: Document): boolean {
		if (documents.some((record) => record.document_id === document.document_id)) return false;
		const now = new Date().toISOString();
		documents.push({
			document_id: document.document_id,
			type: document.nodes[document.document_id].type,
			data: document,
			created_at: now,
			updated_at: now
		});
		return true;
	}

	return { update, rename_property, rename_type, replace_value, delete_property, ensure_document };
}
