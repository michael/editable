import { error, fail, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { site } from '#app/server_site.js';
import type { Actions, PageServerLoad } from './$types';

/** Validate an authorization request. */
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
	if (!locals.user) return { step: 'login' as const };

	const request = await validate_request(url.searchParams);
	if ('error' in request) return { step: 'error' as const, message: request.error };

	const target = new URL(request.redirect_uri);
	return {
		step: 'consent' as const,
		site_host: `${url.host}${site.base}`,
		client_name: request.client.client_name,
		redirect_host: target.host,
		// Only loopback redirects may use plain http, so they lead to an app on this computer.
		on_this_computer: target.protocol === 'http:'
	};
};

export const actions: Actions = {
	// The decision is posted to the page URL, so the OAuth parameters stay with it.
	default: async ({ request, url, locals }) => {
		if (!locals.user) return fail(401, { message: 'Log in to review the request.' });
		const validated = await validate_request(url.searchParams);
		if ('error' in validated) return fail(400, { message: validated.error });

		const target = new URL(validated.redirect_uri);
		if ((await request.formData()).get('decision') === 'allow') {
			const { approve_client, issuer } = await import('#app/server_oauth.js');
			const code = await approve_client({
				client_id: validated.client.client_id,
				redirect_uri: validated.redirect_uri,
				code_challenge: validated.code_challenge
			});
			target.searchParams.set('code', code);
			target.searchParams.set('iss', issuer());
		} else {
			target.searchParams.set('error', 'access_denied');
		}
		if (validated.state) target.searchParams.set('state', validated.state);
		redirect(303, target.href, { external: [target.origin] });
	}
};
