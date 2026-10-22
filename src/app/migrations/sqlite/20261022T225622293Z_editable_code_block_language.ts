import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Code blocks chose their language with layout. Language is a property of its
// own now, and layout places the block like prose; existing blocks stay wide.
export default {
	up({ rename_property, update }: MigrationContext) {
		rename_property('code_block', 'layout', 'language');
		update('code_block', (node) => {
			node.layout = 'wide';
		});
	}
} satisfies Migration;
