import type { MigrationModule } from '#lib/server/migration_registry.js';

export default {
	up({ rename_type, update }) {
		rename_type('preformatted', 'code_block');
		update('code_block', (node) => {
			if (!node.layout) node.layout = 'plain';
		});
	}
} satisfies MigrationModule;
