import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Titled and descriptive gallery layouts name their column count, so the
// 3-column ones read as clearly as the 2-column ones.
export default {
	up({ replace_value }: MigrationContext) {
		for (const type of ['titled_gallery', 'descriptive_gallery']) {
			for (const layout of ['cards', 'outlined', 'carousel']) {
				replace_value(type, 'layout', layout, `${layout}-3-columns`);
			}
		}
	}
} satisfies Migration;
