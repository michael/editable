import { error } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

// RFC 7591 dynamic client registration for public clients.
export const POST: RequestHandler = async ({ request }) => {
	if (VERCEL) error(404, 'Not found');
	const oauth = await import('#app/server_oauth.js');
	try {
		oauth.assert_small_body(request);
		const client = oauth.register_client(await request.json().catch(() => ({})));
		return oauth.oauth_json(
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
		return oauth.oauth_error_response(err);
	}
};

export const OPTIONS: RequestHandler = async () => {
	const { oauth_preflight } = await import('#app/server_oauth.js');
	return oauth_preflight();
};
