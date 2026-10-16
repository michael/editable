import type { Migration } from '#lib/server/migrations.js';

// The file store creates each collection's file on first write.
export default {
	target: 'files',
	up() {}
} satisfies Migration;
