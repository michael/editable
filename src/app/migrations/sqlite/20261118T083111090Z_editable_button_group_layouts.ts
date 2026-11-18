import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Button groups choose the spacing between their buttons. Existing ones keep the regular gap.
export default {
	up({ update }: MigrationContext) {
		update('button_group', (node) => {
			node.layout = 'regular';
		});
	}
} satisfies Migration;
