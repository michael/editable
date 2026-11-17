import { error } from '@sveltejs/kit';
import { oauth_json, protected_resource_metadata } from '#app/server_oauth.js';
import type { RequestHandler } from './$types';

// RFC 9728 metadata for the MCP endpoint, served at the root and at /mcp.
export const GET: RequestHandler = async ({ params }) => {
	if (!['', 'mcp'].includes(params.path)) error(404, 'Not found');
	return oauth_json(protected_resource_metadata());
};
