import { it, expect } from 'vitest';
import { normalize_code_blocks } from './normalize_code_blocks.js';

it('upgrades older browser drafts without changing ids, content, or the input', () => {
	const content = { content: '\tconst x = 1;\n', marks: [], annotations: [] };
	const doc = {
		document_id: 'page',
		nodes: {
			page: { id: 'page', type: 'page', body: { nodes: ['code'] } },
			code: { id: 'code', type: 'preformatted', content }
		}
	};
	const upgraded = normalize_code_blocks(doc);
	expect(upgraded.nodes.code).toEqual({ id: 'code', type: 'code_block', layout: 'plain', content });
	expect(upgraded.nodes.page).toBe(doc.nodes.page);
	expect(doc.nodes.code.type).toBe('preformatted');
	expect(normalize_code_blocks(upgraded)).toBe(upgraded);
});
