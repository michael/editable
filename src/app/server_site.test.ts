import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.doUnmock('$app/env/private');
	vi.doUnmock('$app/server');
	vi.resetModules();
});

it('uses the site a host sets for the request, and the deployment’s own otherwise', async () => {
	const env = { ORIGIN: 'https://example.com', LANGUAGES: 'en,de' };
	vi.doMock('$app/env/private', () => env);
	const hosted = {
		origin: 'https://host.example',
		base: '/alice',
		languages: ['en', 'fr'],
		main_language: 'en'
	};
	let locals: { site?: typeof hosted } = { site: hosted };
	vi.doMock('$app/server', () => ({ getRequestEvent: () => ({ locals }) }));
	const { default_site, site, request_language } = await import('./server_site.js');

	expect({ ...site }).toEqual(hosted);
	// The language is read after the base.
	expect(request_language(new URL('https://host.example/alice/fr/about'))).toBe('fr');
	expect(request_language(new URL('https://host.example/alice'))).toBe('en');

	locals = {};
	expect({ ...site }).toEqual({
		origin: 'https://example.com',
		base: '',
		languages: ['en', 'de'],
		main_language: 'en'
	});
	expect({ ...site }).toEqual(default_site);
});

it.each([
	{ LANGUAGES: 'en', expected: [], main: 'en' },
	// A single language is the site's own, without translations.
	{ LANGUAGES: 'de', expected: [], main: 'de' },
	{ LANGUAGES: 'en,de', expected: ['en', 'de'], main: 'en' }
])(
	'enables languages only when several are configured ($LANGUAGES)',
	async ({ expected, main, ...env }) => {
		vi.doMock('$app/env/private', () => ({ ORIGIN: '', ...env }));
		const { default_site, request_language } = await import('./server_site.js');
		expect(default_site.languages).toEqual(expected);
		expect(default_site.main_language).toBe(main);
		const url = new URL('https://example.com/de');
		if (!expected.length)
			Object.defineProperty(url, 'pathname', {
				get() {
					throw new Error('Disabled languages must not create a navigation dependency');
				}
			});
		expect(request_language(url)).toBe(expected.length ? 'de' : '');
	}
);

it('refuses a site without LANGUAGES', async () => {
	vi.doMock('$app/env/private', () => ({ ORIGIN: '', LANGUAGES: '' }));
	await expect(import('./server_site.js')).rejects.toThrow(
		"LANGUAGES must name the site's language"
	);
});
