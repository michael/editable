import { error } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { RequestHandler } from './$types';

// RFC 9728 metadata for the MCP endpoint, served at the root and at /mcp.
export const GET: RequestHandler = async ({ params }) => {
	if (VERCEL || !['', 'mcp'].includes(params.path)) error(404, 'Not found');
	const { oauth_json, protected_resource_metadata } = await import('#app/server_oauth.js');
	return oauth_json(protected_resource_metadata());
};

export const OPTIONS: RequestHandler = async () => {
	const { oauth_preflight } = await import('#app/server_oauth.js');
	return oauth_preflight();
};
