import { expect, it } from 'vitest';
import { language_href, language_path } from './languages.js';
import {
	parse_internal_page_href,
	translated_href,
	restore_document_links,
	translate_document_links
} from './document_links.js';
import type { Document } from 'svedit';

const languages = ['en', 'de', 'fr', 'pt-BR'];

it.each([
	['/', 'de', '/de'],
	['/de', 'en', '/'],
	['/de/about?ref=a%20b#contact', 'fr', '/fr/about?ref=a%20b#contact'],
	['/de/about?ref=a%20b#contact', 'en', '/about?ref=a%20b#contact'],
	['/about?lang=de&ref=test#contact', 'de', '/de/about?ref=test#contact'],
	['/de/about', 'de', '/de/about'],
	['/about', 'pt-BR', '/pt-BR/about']
])('switches %s to %s', (href, language, expected) => {
	expect(language_href(href, language, languages)).toBe(expected);
});

it('recognizes configured secondary languages only, and leaves paths intact when disabled', () => {
	expect(language_path('/de/about', languages)).toEqual({ language: 'de', pathname: '/about' });
	expect(language_path('/de', languages)).toEqual({ language: 'de', pathname: '/' });
	expect(language_path('/en/about', languages)).toEqual({ language: 'en', pathname: '/en/about' });
	expect(language_path('/es/about', languages)).toEqual({ language: 'en', pathname: '/es/about' });
	expect(language_path('/de/about', [])).toEqual({ language: '', pathname: '/de/about' });
});

it('projects internal links once, preserves explicit language/external/asset links, and restores stored spelling', () => {
	const links = [
		'/',
		'/about?ref=a%20b#contact',
		'https://example.com/about',
		'/fr/about',
		'/assets/photo.webp',
		'https://elsewhere.com/about',
		'#contact',
		'/new'
	];
	const doc: Document = {
		document_id: 'links',
		nodes: Object.fromEntries(
			links.map((href, index) => [String(index), { id: String(index), type: 'link', href }])
		)
	};
	const translated = translate_document_links(doc, 'de', 'https://example.com', languages);
	expect(Object.values(translated.nodes).map((node) => node.href)).toEqual([
		'/de',
		'/de/about?ref=a%20b#contact',
		'https://example.com/de/about',
		...links.slice(3)
	]);
	expect(translate_document_links(translated, 'de', 'https://example.com', languages)).toEqual(
		translated
	);
	expect(restore_document_links(translated, doc, 'de', 'https://example.com', languages)).toEqual(
		doc
	);
	translated.nodes['1'].href = '/de/another?ref=a%20b#contact';
	expect(
		restore_document_links(translated, doc, 'de', 'https://example.com', languages).nodes['1'].href
	).toBe('/another?ref=a%20b#contact');
	expect(translated_href('/de/about', 'fr', 'https://example.com', languages)).toBe('/de/about');
});

it('resolves prefixed internal references while preserving URL suffixes for slug changes', () => {
	expect(parse_internal_page_href('/de/about?ref=test#contact', languages)).toEqual({
		slug: 'about',
		prefix: '/de',
		suffix: '?ref=test#contact'
	});
	expect(parse_internal_page_href('/about#contact', languages)).toEqual({
		slug: 'about',
		prefix: '',
		suffix: '#contact'
	});
	expect(parse_internal_page_href('/de', languages)).toBeNull();
	expect(parse_internal_page_href('/unknown/about', languages)).toBeNull();
	expect(parse_internal_page_href('//elsewhere.com/about', languages)).toBeNull();
});
