import { describe, expect, it } from 'vitest';
import { render_sitemap } from './sitemap.js';

describe('render_sitemap', () => {
	it('renders unique absolute canonical URLs and escapes XML', () => {
		const xml = render_sitemap(['/', '/about', '/a&b', '/about'], 'https://example.com');
		expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(xml).toContain('<loc>https://example.com/</loc>');
		expect(xml).toContain('<loc>https://example.com/about</loc>');
		expect(xml).toContain('<loc>https://example.com/a&amp;b</loc>');
		expect(xml.match(/<url>/g)).toHaveLength(3);
	});

	it('returns an empty sitemap when no homepage exists', () => {
		expect(render_sitemap([], 'https://example.com')).not.toContain('<url>');
	});
});
