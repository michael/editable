import { expect, it } from 'vitest';
import { absolute_page_url, language_alternates } from './seo.js';

it('produces reciprocal language alternatives and the original-language fallback', () => {
	const expected = [
		{ language: 'en', path: '/about' },
		{ language: 'es', path: '/es/about' },
		{ language: 'de', path: '/de/about' },
		{ language: 'x-default', path: '/about' }
	];
	for (const path of ['/about', '/es/about', '/de/about'])
		expect(language_alternates(path, ['en', 'es', 'de'])).toEqual(expected);
	expect(language_alternates('/es', ['en', 'es'])).toEqual([
		{ language: 'en', path: '/' },
		{ language: 'es', path: '/es' },
		{ language: 'x-default', path: '/' }
	]);
	expect(language_alternates('/about', [])).toEqual([]);
});

it('normalizes the configured origin without retaining its path, query, or fragment', () => {
	expect(absolute_page_url('/es/about', 'https://example.com/ignored?preview=1#fragment')).toBe(
		'https://example.com/es/about'
	);
	expect(absolute_page_url('/', 'https://example.com/')).toBe('https://example.com/');
});
