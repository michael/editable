import type { ContentContext, Migration } from '#lib/server/migrations.js';

export default {
	async up({ rename_type, update }: ContentContext) {
		await rename_type('preformatted', 'code_block');
		await update('code_block', (node) => {
			if (!node.layout) node.layout = 'plain';
		});
	}
} satisfies Migration;
