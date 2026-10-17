import { error } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (VERCEL) error(404, 'Not found');
	const oauth = await import('#app/server_oauth.js');
	try {
		oauth.assert_small_body(request);
		const params = new URLSearchParams(await request.text());
		return oauth.oauth_json(await oauth.exchange_token(params));
	} catch (err) {
		return oauth.oauth_error_response(err);
	}
};
