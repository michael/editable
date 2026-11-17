import {
	assert_small_body,
	exchange_token,
	oauth_error_response,
	oauth_json
} from '#app/server_oauth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		assert_small_body(request);
		const params = new URLSearchParams(await request.text());
		return oauth_json(await exchange_token(params));
	} catch (err) {
		return oauth_error_response(err);
	}
};
