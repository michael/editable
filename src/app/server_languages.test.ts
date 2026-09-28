import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
	vi.doUnmock('$app/env/private');
	vi.resetModules();
});

it.each([
	{ LANGUAGES: undefined, VERCEL: undefined, expected: [] },
	{ LANGUAGES: 'en', VERCEL: undefined, expected: [] },
	{ LANGUAGES: 'en,de', VERCEL: undefined, expected: ['en', 'de'] },
	{ LANGUAGES: 'not_a_language', VERCEL: '1', expected: [] }
])(
	'enables languages only when configured on a backend ($LANGUAGES, $VERCEL)',
	async ({ expected, ...env }) => {
		vi.doMock('$app/env/private', () => env);
		const { languages, request_language } = await import('./server_languages.js');
		expect(languages).toEqual(expected);
		const url = new URL('https://example.com/?lang=de');
		if (!expected.length)
			Object.defineProperty(url, 'searchParams', {
				get() {
					throw new Error('Prerender cannot read query parameters');
				}
			});
		expect(request_language(url)).toBe(expected.length ? 'de' : '');
	}
);
