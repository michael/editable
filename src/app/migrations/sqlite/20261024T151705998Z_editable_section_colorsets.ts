import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Sections choose a color set now. Existing sections keep the page's colors.
export default {
	up({ update }: MigrationContext) {
		update('section', (node) => {
			node.colorset = 'colorset-1';
		});
	}
} satisfies Migration;
