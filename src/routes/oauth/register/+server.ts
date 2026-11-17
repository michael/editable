import {
	assert_small_body,
	oauth_error_response,
	oauth_json,
	register_client
} from '#app/server_oauth.js';
import type { RequestHandler } from './$types';

// RFC 7591 dynamic client registration for public clients.
export const POST: RequestHandler = async ({ request }) => {
	try {
		assert_small_body(request);
		const client = register_client(await request.json().catch(() => ({})));
		return oauth_json(
			{
				...client,
				client_id_issued_at: Math.floor(Date.now() / 1000),
				grant_types: ['authorization_code', 'refresh_token'],
				response_types: ['code'],
				token_endpoint_auth_method: 'none'
			},
			201
		);
	} catch (err) {
		return oauth_error_response(err);
	}
};
