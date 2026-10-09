import type { MigrationModule } from '#lib/server/migration_registry.js';

// Every page references the shared site banner, like nav and footer. The banner
// starts empty, which keeps it hidden for visitors until someone writes a message.
export default {
	up({ db, update }) {
		// Fresh databases have no pages yet; seeding creates the banner with them.
		const { page_count } = db
			.prepare("SELECT COUNT(*) AS page_count FROM documents WHERE type = 'page'")
			.get() as { page_count: number };
		if (page_count === 0) return;

		const now = new Date().toISOString();
		const banner_document = {
			document_id: 'banner_1',
			nodes: {
				banner_1: {
					id: 'banner_1',
					type: 'banner',
					content: { content: '', marks: [], annotations: [] }
				}
			}
		};
		db.prepare(
			'INSERT OR IGNORE INTO documents (document_id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
		).run('banner_1', 'banner', JSON.stringify(banner_document), now, now);

		update('page', (node) => {
			if (!node.banner) node.banner = 'banner_1';
		});
	}
} satisfies MigrationModule;
