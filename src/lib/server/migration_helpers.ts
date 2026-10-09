// Content helpers for migrations, so the common transformations do not have to
// be written as SQL against the stored document JSON.
//
// Every helper scans all documents (pages, banner, nav, footer), applies the change to
// matching nodes, and writes back only the documents that actually changed.
// `updated_at` is left untouched: a migration is not a content edit.

import type { DatabaseSync } from 'node:sqlite';

type MigrationNode = Record<string, unknown>;
type MigrationDocument = { nodes?: Record<string, MigrationNode> };
type DocumentRow = { document_id: string; data: string | null };

export type MigrationHelpers = {
	update: (type: string, transform: (node: MigrationNode) => void) => number;
	rename_property: (type: string, from: string, to: string) => number;
	rename_type: (from: string, to: string) => number;
	replace_value: (type: string, property: string, from: unknown, to: unknown) => number;
	delete_property: (type: string, property: string) => number;
};

/**
 * Build the helpers spread into every migration's `up` context.
 */
export function create_migration_helpers(db: DatabaseSync): MigrationHelpers {
	/**
	 * Apply `transform` to every node of `type` in every document. The transform
	 * mutates the node it is given; returns the number of nodes it changed.
	 */
	function update(type: string, transform: (node: MigrationNode) => void): number {
		const rows = db
			.prepare('SELECT document_id, data FROM documents')
			.all() as unknown as DocumentRow[];
		const update_data = db.prepare('UPDATE documents SET data = ? WHERE document_id = ?');

		let changed_nodes = 0;

		for (const row of rows) {
			if (!row.data) continue;

			const document = JSON.parse(row.data) as MigrationDocument;
			let changed_in_document = 0;

			for (const node of Object.values(document.nodes ?? {})) {
				if (!node || node.type !== type) continue;

				// Comparing serialized nodes keeps the transform a plain mutation
				// while still reporting accurate counts.
				const before = JSON.stringify(node);
				transform(node);
				if (JSON.stringify(node) !== before) changed_in_document += 1;
			}

			if (changed_in_document > 0) {
				update_data.run(JSON.stringify(document), row.document_id);
				changed_nodes += changed_in_document;
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
	 * Rename a node type on every node that has it. Document root nodes also
	 * carry their type in the `documents.type` column, which is kept in step.
	 */
	function rename_type(from: string, to: string): number {
		const changed_nodes = update(from, (node) => {
			node.type = to;
		});
		db.prepare('UPDATE documents SET type = ? WHERE type = ?').run(to, from);
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
	 * a property retired from the schema leaves the database.
	 */
	function delete_property(type: string, property: string): number {
		return update(type, (node) => {
			delete node[property];
		});
	}

	return { update, rename_property, rename_type, replace_value, delete_property };
}
