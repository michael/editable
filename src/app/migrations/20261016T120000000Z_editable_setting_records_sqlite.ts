import type { Migration } from '#lib/server/migrations.js';

// SQLite always kept settings as key and value columns.
export default {
	target: 'sqlite',
	up() {}
} satisfies Migration;
