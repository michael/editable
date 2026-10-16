import type { MigrationModule } from '#lib/server/migration_registry.js';

// Every page references the shared site banner, like nav and footer. The banner
// starts empty, which keeps it hidden for visitors until someone writes a message.
export default {
	up({ ensure_document, update }) {
		ensure_document({
			document_id: 'banner_1',
			nodes: {
				banner_1: {
					id: 'banner_1',
					type: 'banner',
					content: { content: '', marks: [], annotations: [] }
				}
			}
		});
		update('page', (node) => {
			if (!node.banner) node.banner = 'banner_1';
		});
	}
} satisfies MigrationModule;
