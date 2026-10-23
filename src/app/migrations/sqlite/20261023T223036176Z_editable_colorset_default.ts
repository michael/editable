import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Color set 1 is the default now and keeps the surrounding colors, so 'inherit' is gone.
export default {
	up({ replace_value }: MigrationContext) {
		replace_value('section', 'colorset', 'inherit', 'colorset-1');
		replace_value('prose_grid', 'colorset', 'inherit', 'colorset-1');
	}
} satisfies Migration;
