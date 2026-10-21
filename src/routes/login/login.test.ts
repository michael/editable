import { expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ VERCEL: '' }));
vi.mock('#app/server_site.js', () => ({
	site: { origin: 'https://example.com', base: '', languages: [] }
}));

import { load } from './+page.server.js';

const visit = (target: string, user: object | null = null) =>
	(load as any)({
		locals: { user },
		url: new URL(`https://example.com/login?redirect_to=${target}`)
	});

it('remembers where to go after logging in, on this site only', async () => {
	expect(await visit('/orders')).toEqual({ redirect_to: '/orders' });
	for (const elsewhere of ['//evil.example', '/\\evil.example', 'https://evil.example', 'evil'])
		expect(await visit(encodeURIComponent(elsewhere))).toEqual({ redirect_to: '/' });
});

it('sends someone already signed in on', async () => {
	await expect(visit('/orders', { username: 'ben' })).rejects.toMatchObject({
		status: 303,
		location: '/orders'
	});
});
