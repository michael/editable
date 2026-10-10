import { error } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

// RFC 8414 authorization server metadata.
export const GET: RequestHandler = async () => {
	if (VERCEL) error(404, 'Not found');
	const { oauth_json, authorization_server_metadata } = await import('#app/server_oauth.js');
	return oauth_json(authorization_server_metadata());
};

export const OPTIONS: RequestHandler = async () => {
	const { oauth_preflight } = await import('#app/server_oauth.js');
	return oauth_preflight();
};
