import { authorization_server_metadata, oauth_json } from '#app/server_oauth.js';
import type { RequestHandler } from './$types';

// RFC 8414 authorization server metadata.
export const GET: RequestHandler = async () => {
	return oauth_json(authorization_server_metadata());
};
