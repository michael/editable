import { describe, it, expect } from 'vitest';
import { MARKDOWN_SOURCES } from '#app/content_config.js';
import { build_registry, get_markdown_page, is_reserved_markdown_slug } from './registry.js';
import { convert_markdown } from './convert.js';

describe('build_registry', () => {
	it('builds an empty registry from an empty mapping', () => {
		expect(build_registry([]).size).toBe(0);
	});

	it('indexes configured pages by pathname', () => {
		const registry = build_registry([
			{ markdown: '# Manual', source: 'MANUAL.md', pathname: '/manual', toc: true },
			{ markdown: '# Guide', source: 'content/guide.md', pathname: '/guide' }
		]);
		expect(registry.get('/manual')).toEqual({
			markdown: '# Manual',
			source: 'MANUAL.md',
			pathname: '/manual',
			toc: true
		});
		expect(registry.get('/guide')?.markdown).toBe('# Guide');
	});

	it('propagates configuration errors', () => {
		expect(() =>
			build_registry([{ markdown: '# X', source: 'MANUAL.md', pathname: 'manual' }])
		).toThrow(/absolute URL path/);
	});
});

describe('get_markdown_page', () => {
	it('returns null for unmapped pathnames', () => {
		expect(get_markdown_page('/not-mapped-anywhere')).toBe(null);
	});
});

describe('is_reserved_markdown_slug', () => {
	it('reserves every configured pathname', () => {
		for (const { pathname } of MARKDOWN_SOURCES) {
			expect(is_reserved_markdown_slug(pathname.slice(1))).toBe(true);
		}
	});

	it('does not reserve unmapped slugs', () => {
		expect(is_reserved_markdown_slug('not-mapped-anywhere')).toBe(false);
	});
});

describe('configured pages', () => {
	// They convert on request, so a link the converter refuses, such as one to
	// a .md file, would otherwise first fail on the deployed site.
	it('convert without errors', () => {
		for (const source of MARKDOWN_SOURCES) convert_markdown(source.markdown, source);
	});
});
