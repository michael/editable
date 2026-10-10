import { error, fail, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

/**
 * Validate an authorization request. Only called for a logged-in admin, so
 * fetching a client ID metadata document cannot be triggered anonymously.
 */
async function validate_request(params: URLSearchParams) {
	const oauth = await import('#app/server_oauth.js');
	const code_challenge = params.get('code_challenge') ?? '';
	if (params.get('response_type') !== 'code')
		return { error: 'Only response_type=code is supported.' } as const;
	if (params.get('code_challenge_method') !== 'S256' || !/^[\w-]{43}$/.test(code_challenge))
		return { error: 'A PKCE code challenge with method S256 is required.' } as const;
	if (!oauth.is_own_resource(params.get('resource')))
		return { error: `Access can only be granted to ${oauth.mcp_resource()}.` } as const;

	const client = await oauth.find_client(params.get('client_id') ?? '');
	if (!client)
		return {
			error: 'The app could not be identified. Start connecting again from the app.'
		} as const;
	const redirect_uri = params.get('redirect_uri') ?? '';
	if (!client.redirect_uris.includes(redirect_uri))
		return { error: 'The app asked to send access to an unregistered address.' } as const;

	return { client, redirect_uri, code_challenge, state: params.get('state') };
}

export const load: PageServerLoad = async ({ url, locals }) => {
	if (VERCEL) error(404, 'Not found');
	if (!locals.is_admin) return { step: 'login' as const };

	const request = await validate_request(url.searchParams);
	if ('error' in request) return { step: 'error' as const, message: request.error };

	const { is_loopback_redirect } = await import('#app/server_oauth.js');
	return {
		step: 'consent' as const,
		client_name: request.client.client_name,
		// A metadata document URL proves which domain published the app's details.
		client_domain: URL.parse(request.client.client_id)?.host ?? null,
		redirect_host: new URL(request.redirect_uri).host,
		on_this_computer: is_loopback_redirect(request.redirect_uri)
	};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const [{ db }, { log_in_admin }] = await Promise.all([
			import('#app/services.js'),
			import('#lib/server/auth.js')
		]);
		const password = String((await request.formData()).get('password') ?? '');
		const result = log_in_admin(db, cookies, password);
		if ('message' in result) return fail(400, { message: result.message });
	},

	approve: async ({ url, locals }) => {
		if (!locals.is_admin) return fail(401, { message: 'Log in to approve the connection.' });
		const request = await validate_request(url.searchParams);
		if ('error' in request) return fail(400, { message: request.error });

		const { approve_client, issuer } = await import('#app/server_oauth.js');
		const code = approve_client({
			client_id: request.client.client_id,
			redirect_uri: request.redirect_uri,
			code_challenge: request.code_challenge
		});
		const target = new URL(request.redirect_uri);
		target.searchParams.set('code', code);
		if (request.state) target.searchParams.set('state', request.state);
		target.searchParams.set('iss', issuer());
		redirect(303, target.href);
	},

	deny: async ({ url, locals }) => {
		if (!locals.is_admin) return fail(401, { message: 'Log in first.' });
		const request = await validate_request(url.searchParams);
		if ('error' in request) return fail(400, { message: request.error });

		const target = new URL(request.redirect_uri);
		target.searchParams.set('error', 'access_denied');
		if (request.state) target.searchParams.set('state', request.state);
		redirect(303, target.href);
	}
};
