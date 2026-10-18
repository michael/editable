import type { ContentContext, Migration } from '#lib/server/migrations.js';

export default {
	up({ rename_type, update }: ContentContext) {
		rename_type('preformatted', 'code_block');
		update('code_block', (node) => {
			if (!node.layout) node.layout = 'plain';
		});
	}
} satisfies Migration;
