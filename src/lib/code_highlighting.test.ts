import { describe, it, expect } from 'vitest';
import { code_layouts } from '#app/code_languages.js';
import { highlight_code } from './code_highlighting.js';

describe('code highlighting', () => {
	it.each(code_layouts.filter((layout) => layout !== 'plain'))(
		'preserves source text for %s',
		(layout) => {
			const source = '\tconst message = "<script>alert(1)</script> & 🦊";\r\n// comment\n';
			const segments = highlight_code(source, layout);
			expect(segments).not.toBeNull();
			expect(segments?.map((segment) => segment.text).join('')).toBe(source);
			expect(highlight_code('', layout)).toEqual([]);
		}
	);

	it('distinguishes JavaScript keywords, strings, and comments', () => {
		const segments = highlight_code('const value = "hello"; // comment', 'javascript')!;
		expect(segments.find((segment) => segment.text === 'const')?.class_name).toBe(
			'text-(--code-keyword)'
		);
		expect(segments.find((segment) => segment.text.includes('hello'))?.class_name).toBe(
			'text-(--code-string)'
		);
		expect(segments.find((segment) => segment.text.includes('// comment'))?.class_name).toBe(
			'text-(--code-comment)'
		);
	});

	it('leaves plain text and unknown languages unhighlighted', () => {
		expect(highlight_code('const value = 1;', 'plain')).toBeNull();
		expect(highlight_code('const value = 1;', 'unknown')).toBeNull();
		expect(highlight_code('const value = 1;', 'constructor')).toBeNull();
	});
});
