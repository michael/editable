import type { Migration, MigrationContext } from '#lib/server/migrations.js';

export default {
	target: 'sqlite',
	up({ rename_type, update }: MigrationContext) {
		rename_type('preformatted', 'code_block');
		update('code_block', (node) => {
			if (!node.layout) node.layout = 'plain';
		});
	}
} satisfies Migration;
