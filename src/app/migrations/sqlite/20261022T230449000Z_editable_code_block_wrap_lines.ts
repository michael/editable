import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Code blocks can wrap their lines now; existing blocks keep scrolling sideways.
export default {
	up({ update }: MigrationContext) {
		update('code_block', (node) => {
			node.wrap_lines = false;
		});
	}
} satisfies Migration;
