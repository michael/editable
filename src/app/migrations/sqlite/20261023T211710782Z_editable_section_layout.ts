import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Sections choose a color scheme with layout now. Existing sections keep the regular colors.
export default {
	up({ update }: MigrationContext) {
		update('section', (node) => {
			node.layout = 'regular';
		});
	}
} satisfies Migration;
