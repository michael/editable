import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.doUnmock('$app/env/private');
	vi.doUnmock('$app/server');
	vi.resetModules();
});

it('uses the site a host sets for the request, and the deployment’s own otherwise', async () => {
	const env = { ORIGIN: 'https://example.com', LANGUAGES: 'en,de', VERCEL: undefined };
	vi.doMock('$app/env/private', () => env);
	const hosted = { origin: 'https://host.example', base: '/alice', languages: ['en', 'fr'] };
	let locals: { site?: typeof hosted } = { site: hosted };
	vi.doMock('$app/server', () => ({ getRequestEvent: () => ({ locals }) }));
	const { default_site, get_site, request_language } = await import('./server_site.js');

	expect(get_site()).toBe(hosted);
	// The language is read after the base.
	expect(request_language(new URL('https://host.example/alice/fr/about'))).toBe('fr');
	expect(request_language(new URL('https://host.example/alice'))).toBe('en');

	locals = {};
	expect(get_site()).toEqual({ origin: 'https://example.com', base: '', languages: ['en', 'de'] });
	expect(get_site()).toBe(default_site);
});

it.each([
	{ LANGUAGES: undefined, VERCEL: undefined, expected: [] },
	{ LANGUAGES: 'en', VERCEL: undefined, expected: [] },
	{ LANGUAGES: 'en,de', VERCEL: undefined, expected: ['en', 'de'] },
	{ LANGUAGES: 'not_a_language', VERCEL: '1', expected: [] }
])(
	'enables languages only when configured on a backend ($LANGUAGES, $VERCEL)',
	async ({ expected, ...env }) => {
		vi.doMock('$app/env/private', () => ({ ORIGIN: '', ...env }));
		const { default_site, request_language } = await import('./server_site.js');
		expect(default_site.languages).toEqual(expected);
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
