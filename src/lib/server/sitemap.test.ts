import { describe, expect, it } from 'vitest';
import { latest_modified, render_sitemap } from './sitemap.js';
import { language_alternates } from '#app/seo.js';

describe('render_sitemap', () => {
	it('renders unique absolute canonical URLs and escapes XML', () => {
		const entries = ['/', '/about', '/a&b', '/about'].map((path) => ({ path, lastmod: null }));
		const xml = render_sitemap(entries, 'https://example.com');
		expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
		expect(xml).toContain('<loc>https://example.com/</loc>');
		expect(xml).toContain('<loc>https://example.com/about</loc>');
		expect(xml).toContain('<loc>https://example.com/a&amp;b</loc>');
		expect(xml.match(/<url>/g)).toHaveLength(3);
	});

	it('includes saved timestamps as ISO lastmod dates', () => {
		const xml = render_sitemap(
			[
				{ path: '/', lastmod: '2025-05-28T11:40:22.299Z' },
				{ path: '/about', lastmod: '2025-05-28T13:40:22.299+02:00' }
			],
			'https://example.com'
		);
		expect(xml.match(/<lastmod>2025-05-28T11:40:22.299Z<\/lastmod>/g)).toHaveLength(2);
	});

	it('omits lastmod when a saved timestamp is missing or invalid', () => {
		const xml = render_sitemap(
			[
				{ path: '/', lastmod: null },
				{ path: '/about', lastmod: 'invalid' }
			],
			'https://example.com'
		);
		expect(xml).not.toContain('<lastmod>');
		expect(xml.match(/<url>/g)).toHaveLength(2);
	});

	it('returns an empty sitemap when no homepage exists', () => {
		expect(render_sitemap([], 'https://example.com')).not.toContain('<url>');
	});

	it('lists reciprocal language alternatives on every localized URL', () => {
		const alternates = language_alternates('/a&b', ['en', 'es']);
		const xml = render_sitemap(
			['/a&b', '/es/a&b'].map((path) => ({ path, lastmod: null, alternates })),
			'https://example.com/'
		);
		expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
		expect(xml.match(/<url>/g)).toHaveLength(2);
		for (const entry of xml.match(/<url>.*?<\/url>/g)!) {
			expect(entry).toContain('hreflang="en" href="https://example.com/a&amp;b"');
			expect(entry).toContain('hreflang="es" href="https://example.com/es/a&amp;b"');
			expect(entry).toContain('hreflang="x-default" href="https://example.com/a&amp;b"');
		}
	});

	it('uses the latest real modification date while ignoring invalid timestamps', () => {
		expect(latest_modified([null, 'invalid'])).toBeNull();
		expect(latest_modified(['2026-10-01T10:00:00Z', '2026-10-02T10:00:00+02:00', 'bad'])).toBe(
			'2026-10-02T08:00:00.000Z'
		);
	});
});
