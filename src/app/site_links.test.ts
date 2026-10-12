import { expect, it } from 'vitest';
import { with_site_base, without_site_base } from './site_links.js';
import { absolute_page_url } from './seo.js';

it('prefixes site-relative links with the base and leaves other links alone', () => {
	const cases = [
		['/', '/alice'],
		['/about', '/alice/about'],
		['/about?x=1#top', '/alice/about?x=1#top'],
		['/?x=1', '/alice?x=1'],
		['/#top', '/alice#top'],
		['https://example.com/about', 'https://example.com/about'],
		['//cdn.example.com/a.js', '//cdn.example.com/a.js'],
		['mailto:hi@example.com', 'mailto:hi@example.com'],
		['#top', '#top'],
		['./relative', './relative']
	];
	for (const [href, expected] of cases) expect(with_site_base(href, '/alice')).toBe(expected);
	expect(with_site_base('/about', '')).toBe('/about');
});

it('strips the base from pathnames that carry it', () => {
	expect(without_site_base('/alice', '/alice')).toBe('/');
	expect(without_site_base('/alice/de/about', '/alice')).toBe('/de/about');
	// A path that only starts with the same letters is not under the base.
	expect(without_site_base('/alicia/about', '/alice')).toBe('/alicia/about');
	// Hosts that strip the base before Editable sees the request.
	expect(without_site_base('/about', '/alice')).toBe('/about');
	expect(without_site_base('/about', '')).toBe('/about');
});

it('builds absolute URLs from the origin, the base, and the page path', () => {
	expect(absolute_page_url('/about', 'https://example.com', '/alice')).toBe(
		'https://example.com/alice/about'
	);
	expect(absolute_page_url('/', 'https://example.com', '/alice')).toBe('https://example.com/alice');
	// A path in the configured origin is still ignored.
	expect(absolute_page_url('/about', 'https://example.com/ignored', '/alice')).toBe(
		'https://example.com/alice/about'
	);
});
