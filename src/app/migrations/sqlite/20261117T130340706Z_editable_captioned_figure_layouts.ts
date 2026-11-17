import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Captioned figures choose where their caption goes. Existing ones keep it below.
export default {
	up({ update }: MigrationContext) {
		update('captioned_figure', (node) => {
			node.layout = 'caption-below';
		});
	}
} satisfies Migration;
