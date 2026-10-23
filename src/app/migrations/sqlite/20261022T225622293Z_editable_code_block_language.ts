import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Code blocks chose their language with layout. Language is a property of its
// own now, layout places the block like prose, and lines can wrap. Existing
// blocks stay wide and keep scrolling sideways.
export default {
	up({ rename_property, update }: MigrationContext) {
		rename_property('code_block', 'layout', 'language');
		update('code_block', (node) => {
			node.layout = 'wide';
			node.wrap_lines = false;
		});
	}
} satisfies Migration;
