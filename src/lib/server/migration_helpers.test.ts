import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Document } from 'svedit';
import { create_migration_helpers } from './migration_helpers.js';
import { sqlite_backend } from './backends/sqlite_backend.js';
import type { Backend } from './backend.js';
import initial_schema from '#app/migrations/20260803T131059242Z_editable_initial_schema.js';
import type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';

async function create_db(documents: Record<string, unknown>) {
	const sqlite = new DatabaseSync(':memory:');
	initial_schema.up({ db: sqlite } as SqliteStorage);
	const db = sqlite_backend({
		db: sqlite,
		asset_dir: mkdtempSync(join(tmpdir(), 'editable-assets-'))
	});
	for (const [document_id, data] of Object.entries(documents)) {
		await db.documents.put({
			document_id,
			type: 'page',
			data: data as Document,
			created_at: 'created',
			updated_at: 'updated'
		});
	}
	return db;
}

async function read_nodes(db: Backend, document_id: string) {
	return (await db.documents.get(document_id))!.data.nodes as Record<string, any>;
}

describe('rename_property', () => {
	it('renames the property on matching nodes only', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1' },
					story_1: { id: 'story_1', type: 'story', image: 'asset_2' }
				}
			}
		});
		const helpers = create_migration_helpers(db);

		expect(await helpers.rename_property('hero', 'image', 'media')).toBe(1);

		const result = await read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'hero', media: 'asset_1' });
		expect(result.story_1.image).toBe('asset_2');
	});

	it('keeps the property position, so node key order stays stable', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1', layout: 'default' } }
			}
		});

		await create_migration_helpers(db).rename_property('hero', 'image', 'media');

		expect(Object.keys((await read_nodes(db, 'page_1')).hero_1)).toEqual([
			'id',
			'type',
			'media',
			'layout'
		]);
	});

	it('leaves nodes without the property alone', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero' } }
			}
		});

		expect(await create_migration_helpers(db).rename_property('hero', 'image', 'media')).toBe(0);
	});

	it('throws when the target property already exists', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', image: 'asset_1', media: 'asset_2' } }
			}
		});

		await expect(
			create_migration_helpers(db).rename_property('hero', 'image', 'media')
		).rejects.toThrow(/already has that property/);
	});
});

describe('replace_value', () => {
	it('replaces the value across documents and reports the count', async () => {
		const db = await create_db({
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

		expect(await helpers.replace_value('hero', 'layout', 'default', 'regular')).toBe(2);

		expect((await read_nodes(db, 'page_1')).hero_1.layout).toBe('regular');
		expect((await read_nodes(db, 'page_1')).hero_2.layout).toBe('wide');
		expect((await read_nodes(db, 'page_2')).hero_3.layout).toBe('regular');
	});
});

describe('rename_type', () => {
	it('renames matching nodes only', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', layout: 'default' },
					story_1: { id: 'story_1', type: 'story' }
				}
			}
		});

		expect(await create_migration_helpers(db).rename_type('hero', 'banner')).toBe(1);

		const result = await read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'banner', layout: 'default' });
		expect(result.story_1.type).toBe('story');
	});

	it('keeps the record type in step for document root nodes', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { page_1: { id: 'page_1', type: 'page' } }
			}
		});

		expect(await create_migration_helpers(db).rename_type('page', 'article')).toBe(1);

		expect((await read_nodes(db, 'page_1')).page_1.type).toBe('article');
		expect((await db.documents.get('page_1'))!.type).toBe('article');
	});
});

describe('delete_property', () => {
	it('drops the property from matching nodes only', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: {
					hero_1: { id: 'hero_1', type: 'hero', subtitle: 'stale', layout: 'default' },
					story_1: { id: 'story_1', type: 'story', subtitle: 'kept' }
				}
			}
		});

		expect(await create_migration_helpers(db).delete_property('hero', 'subtitle')).toBe(1);

		const result = await read_nodes(db, 'page_1');
		expect(result.hero_1).toEqual({ id: 'hero_1', type: 'hero', layout: 'default' });
		expect(result.story_1.subtitle).toBe('kept');
	});

	it('leaves nodes without the property alone', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero' } }
			}
		});

		expect(await create_migration_helpers(db).delete_property('hero', 'subtitle')).toBe(0);
	});
});

describe('update', () => {
	it('applies arbitrary transforms and leaves updated_at untouched', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', layout: 'default' } }
			}
		});

		const changed = await create_migration_helpers(db).update('hero', (node) => {
			node.layout = `${node.layout}-v2`;
		});

		expect(changed).toBe(1);
		expect((await read_nodes(db, 'page_1')).hero_1.layout).toBe('default-v2');

		expect((await db.documents.get('page_1'))!.updated_at).toBe('updated');
	});

	it('reports no changes when the transform changes nothing', async () => {
		const db = await create_db({
			page_1: {
				document_id: 'page_1',
				nodes: { hero_1: { id: 'hero_1', type: 'hero', layout: 'default' } }
			}
		});

		expect(await create_migration_helpers(db).update('hero', () => {})).toBe(0);
	});
});

describe('ensure_document', () => {
	it('adds a document typed by its root node, and leaves an existing one alone', async () => {
		const db = await create_db({});
		const helpers = create_migration_helpers(db);
		const banner = {
			document_id: 'banner_1',
			nodes: { banner_1: { id: 'banner_1', type: 'banner' } }
		} as Document;

		expect(await helpers.ensure_document(banner)).toBe(true);
		expect(await db.documents.get('banner_1')).toMatchObject({ type: 'banner', data: banner });

		const changed = { ...banner, nodes: { banner_1: { id: 'banner_1', type: 'banner', x: 1 } } };
		expect(await helpers.ensure_document(changed as Document)).toBe(false);
		expect((await db.documents.get('banner_1'))!.data).toEqual(banner);
	});
});
