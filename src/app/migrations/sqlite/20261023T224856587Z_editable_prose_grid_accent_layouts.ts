import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Color sets apply to sections only. Prose grid boxes in color set 3 become the accent
// layouts, which use the accent surface of their section.
export default {
	up({ update }: MigrationContext) {
		update('prose_grid', (node) => {
			const layout = String(node.layout);
			if (node.colorset === 'colorset-3' && layout.startsWith('boxed')) {
				node.layout = layout.replace('boxed', 'boxed-accent');
			}
			delete node.colorset;
		});
	}
} satisfies Migration;
