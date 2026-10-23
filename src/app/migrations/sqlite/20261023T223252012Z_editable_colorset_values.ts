import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Earlier color set migrations could be recorded without running, so make every stored
// value valid: anything but color set 2 or 3 becomes color set 1, the default.
export default {
	up({ update }: MigrationContext) {
		for (const type of ['section', 'prose_grid']) {
			update(type, (node) => {
				if (node.colorset !== 'colorset-2' && node.colorset !== 'colorset-3') {
					node.colorset = 'colorset-1';
				}
				if (type === 'section') delete node.layout;
			});
		}
	}
} satisfies Migration;
