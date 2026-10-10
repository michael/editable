import { error } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (VERCEL) error(404, 'Not found');
	const oauth = await import('#app/server_oauth.js');
	try {
		const params = new URLSearchParams(await request.text());
		return oauth.oauth_json(oauth.exchange_token(params));
	} catch (err) {
		return oauth.oauth_error_response(err);
	}
};

export const OPTIONS: RequestHandler = async () => {
	const { oauth_preflight } = await import('#app/server_oauth.js');
	return oauth_preflight();
};
