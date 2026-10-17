import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import type { Document } from 'svedit';
import { create_migration_helpers } from './migration_helpers.js';
import { sqlite_database } from './storage/backends/sqlite_database.js';
import type { Database } from './storage/database.js';
import initial_schema from '#app/migrations/20260803T131059242Z_editable_initial_schema.js';

function create_db(documents: Record<string, unknown>) {
	const sqlite = new DatabaseSync(':memory:');
	initial_schema.up({ db: sqlite });
	const db = sqlite_database(sqlite);
	for (const [document_id, data] of Object.entries(documents)) {
		db.documents.put({
			document_id,
			type: 'page',
			data: data as Document,
			created_at: 'created',
			updated_at: 'updated'
		});
	}
	return db;
}

function read_nodes(db: Database, document_id: string) {
	return db.documents.get(document_id)!.data.nodes as Record<string, any>;
}

describe('rename_property', () => {
	it('renames the property on matching nodes only', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1' },
					story_1: { id: 'story_1', type: 'story', image: 'asset_2' }
				}
			}
		});
		const helpers = create_migration_helpers(db);

		expect(helpers.rename_property('hero', 'image', 'media')).toBe(1);

		const result = read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'hero', media: 'asset_1' });
		expect(result.story_1.image).toBe('asset_2');
	});

	it('keeps the property position, so node key order stays stable', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1', layout: 'default' } }
			}
		});

		create_migration_helpers(db).rename_property('hero', 'image', 'media');

		expect(Object.keys(read_nodes(db, 'page_1').hero_1)).toEqual(['id', 'type', 'media', 'layout']);
	});

	it('leaves nodes without the property alone', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero' } }
			}
		});

		expect(create_migration_helpers(db).rename_property('hero', 'image', 'media')).toBe(0);
	});

	it('throws when the target property already exists', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1', media: 'asset_2' } }
			}
		});

		expect(() => create_migration_helpers(db).rename_property('hero', 'image', 'media')).toThrow(
			/already has that property/
		);
	});
});

describe('replace_value', () => {
	it('replaces the value across documents and reports the count', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', layout: 'default' },
					hero_2: { id: 'hero_2', type: 'hero', layout: 'wide' }
				}
			},
			page_2: {
				document_id: 'page_2',
				nodes: { hero_3: { id: 'hero_3', type: 'hero', layout: 'default' } }
			}
		});
		const helpers = create_migration_helpers(db);

		expect(helpers.replace_value('hero', 'layout', 'default', 'regular')).toBe(2);

		expect(read_nodes(db, 'page_1').hero_1.layout).toBe('regular');
		expect(read_nodes(db, 'page_1').hero_2.layout).toBe('wide');
		expect(read_nodes(db, 'page_2').hero_3.layout).toBe('regular');
	});
});

describe('rename_type', () => {
	it('renames matching nodes only', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', layout: 'default' },
					story_1: { id: 'story_1', type: 'story' }
				}
			}
		});

		expect(create_migration_helpers(db).rename_type('hero', 'banner')).toBe(1);

		const result = read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'banner', layout: 'default' });
		expect(result.story_1.type).toBe('story');
	});

	it('keeps the record type in step for document root nodes', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { page_1: { id: 'page_1', type: 'page' } }
			}
		});

		expect(create_migration_helpers(db).rename_type('page', 'article')).toBe(1);

		expect(read_nodes(db, 'page_1').page_1.type).toBe('article');
		expect(db.documents.get('page_1')!.type).toBe('article');
	});
});

describe('delete_property', () => {
	it('drops the property from matching nodes only', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', subtitle: 'stale', layout: 'default' },
					story_1: { id: 'story_1', type: 'story', subtitle: 'kept' }
				}
			}
		});

		expect(create_migration_helpers(db).delete_property('hero', 'subtitle')).toBe(1);

		const result = read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'hero', layout: 'default' });
		expect(result.story_1.subtitle).toBe('kept');
	});

	it('leaves nodes without the property alone', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero' } }
			}
		});

		expect(create_migration_helpers(db).delete_property('hero', 'subtitle')).toBe(0);
	});
});

describe('update', () => {
	it('applies arbitrary transforms and leaves updated_at untouched', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', layout: 'default' } }
			}
		});

		const changed = create_migration_helpers(db).update('hero', (node) => {
			node.layout = `${node.layout}-v2`;
		});

		expect(changed).toBe(1);
		expect(read_nodes(db, 'page_1').hero_1.layout).toBe('default-v2');

		expect(db.documents.get('page_1')!.updated_at).toBe('updated');
	});

	it('reports no changes when the transform changes nothing', () => {
		const db = create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', layout: 'default' } }
			}
		});

		expect(create_migration_helpers(db).update('hero', () => {})).toBe(0);
	});
});

describe('ensure_document', () => {
	it('adds a document typed by its root node, and leaves an existing one alone', () => {
		const db = create_db({});
		const helpers = create_migration_helpers(db);
		const banner = {
			document_id: 'banner_1',
			nodes: { banner_1: { id: 'banner_1', type: 'banner' } }
		} as Document;

		expect(helpers.ensure_document(banner)).toBe(true);
		expect(db.documents.get('banner_1')).toMatchObject({ type: 'banner', data: banner });

		const changed = { ...banner, nodes: { banner_1: { id: 'banner_1', type: 'banner', x: 1 } } };
		expect(helpers.ensure_document(changed as Document)).toBe(false);
		expect(db.documents.get('banner_1')!.data).toEqual(banner);
	});
});
