import { expect, it } from 'vitest';
import type { Document } from 'svedit';
import { normalize_href, normalize_hrefs, resolve_href, resolve_hrefs } from './document_links.js';
import { absolute_page_url } from './seo.js';

const site = { origin: 'https://example.com', base: '/alice', languages: ['en', 'de'] };

it("serves links under the site base and page links in the reader's language", () => {
	const cases: [string, string, string][] = [
		['/', '', '/alice'],
		['/about', '', '/alice/about'],
		['/about?x=1#top', '', '/alice/about?x=1#top'],
		['/?x=1', '', '/alice?x=1'],
		['/about', 'de', '/alice/de/about'],
		['/', 'de', '/alice/de'],
		// A link naming a language keeps it.
		['/de/about', 'fr', '/alice/de/about'],
		// Not pages: the base only.
		['/assets/a.webp', 'de', '/alice/assets/a.webp'],
		['/new', 'de', '/alice/new'],
		['/api/assets', 'de', '/alice/api/assets'],
		['https://example.com/about', 'de', 'https://example.com/alice/de/about'],
		['https://elsewhere.com/about', 'de', 'https://elsewhere.com/about'],
		['//cdn.example.com/a.js', 'de', '//cdn.example.com/a.js'],
		['mailto:hi@example.com', 'de', 'mailto:hi@example.com'],
		['#top', 'de', '#top']
	];
	for (const [href, language, expected] of cases) {
		expect(resolve_href(href, site, language)).toBe(expected);
		// Resolving a resolved link changes nothing.
		expect(resolve_href(expected, site, language)).toBe(expected);
	}
	expect(resolve_href('/about', { ...site, base: '' }, '')).toBe('/about');
	// The main language by its code means no prefix either.
	expect(resolve_href('/about', site, 'en')).toBe('/alice/about');
	expect(resolve_href('/', site, 'en')).toBe('/alice');
});

it("takes the page's language off first when the site carries one, as the browser's does", () => {
	const page = { ...site, language: 'de' };
	expect(resolve_href('/alice/de/about?x', page)).toBe('/alice/de/about?x');
	expect(resolve_href('/alice/de/about', page, 'en')).toBe('/alice/about');
	expect(resolve_href('/alice/de/about', page, 'fr')).toBe('/alice/fr/about');
	expect(resolve_href('/assets/a.webp', page)).toBe('/alice/assets/a.webp');
	expect(normalize_href('/alice/de/about', page)).toBe('/about');
	expect(normalize_href('/alice/de/about', page, '')).toBe('/de/about');
	expect(normalize_href('/alice/about', { ...site, language: 'en' })).toBe('/about');
});

it('normalizes served links back to their stored form', () => {
	expect(normalize_href('/alice', site, '')).toBe('/');
	expect(normalize_href('/alice/de/about?x', site, 'de')).toBe('/about?x');
	// A language other than the reader's stays explicit.
	expect(normalize_href('/alice/de/about', site, '')).toBe('/de/about');
	expect(normalize_href('/alice/assets/a.webp', site, 'de')).toBe('/assets/a.webp');
	expect(normalize_href('https://example.com/alice/about', site, '')).toBe(
		'https://example.com/about'
	);
	// A path that only starts with the same letters is not under the base.
	expect(normalize_href('/alicia/about', site, '')).toBe('/alicia/about');
	// Hosts that strip the base before Editable sees the request.
	expect(normalize_href('/about', site, '')).toBe('/about');
	expect(normalize_href('https://elsewhere.com/alice/about', site, '')).toBe(
		'https://elsewhere.com/alice/about'
	);
});

it('resolves every link of a document on the way out and normalizes it on the way back', () => {
	const link = (id: string, href: string) => [id, { id, type: 'link', href }];
	const doc = {
		document_id: 'p',
		nodes: Object.fromEntries([
			link('1', '/about'),
			link('2', '/de/about?x=1#top'),
			link('3', 'https://example.com/'),
			link('4', 'https://other.example/about')
		])
	} as Document;
	const hrefs = (document: Document) => Object.values(document.nodes).map((node) => node.href);

	const served = resolve_hrefs(doc, site, '');
	expect(hrefs(served)).toEqual([
		'/alice/about',
		'/alice/de/about?x=1#top',
		'https://example.com/alice',
		'https://other.example/about'
	]);
	expect(hrefs(resolve_hrefs(doc, site, 'de'))).toEqual([
		'/alice/de/about',
		'/alice/de/about?x=1#top',
		'https://example.com/alice/de',
		'https://other.example/about'
	]);
	expect(normalize_hrefs(served, doc, site, '')).toEqual(doc);
	// Nothing to change, nothing copied.
	const root = { ...site, base: '' };
	expect(resolve_hrefs(doc, root)).toBe(doc);
	expect(normalize_hrefs(doc, doc, root)).toBe(doc);

	// A link added in the editor is stored without the base and the current language.
	const edited = { document_id: 'p', nodes: Object.fromEntries([link('5', '/alice/de/team?x')]) };
	const empty = { document_id: 'p', nodes: {} };
	expect(normalize_hrefs(edited as Document, empty, site, 'de').nodes['5'].href).toBe('/team?x');
});

it('builds absolute URLs from the origin, the base, and the page path', () => {
	expect(absolute_page_url('/about', { origin: 'https://example.com', base: '/alice' })).toBe(
		'https://example.com/alice/about'
	);
	expect(absolute_page_url('/', { origin: 'https://example.com', base: '/alice' })).toBe(
		'https://example.com/alice'
	);
	// A path in the configured origin is still ignored.
	expect(
		absolute_page_url('/about', { origin: 'https://example.com/ignored', base: '/alice' })
	).toBe('https://example.com/alice/about');
});
