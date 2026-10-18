import type { Migration } from '#lib/server/migrations.js';

// The files backend creates each kind of record's file on first write.
export default {
	target: 'files',
	up() {}
} satisfies Migration;
