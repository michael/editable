import { error, fail, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (VERCEL) error(404, 'Not found');
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (VERCEL) error(404, 'Not found');
		const { create_site, start_session } = await import('../../host/sites.js');
		const data = await request.formData();
		const name = String(data.get('name') ?? '')
			.trim()
			.toLowerCase();
		const message = create_site(name, String(data.get('password') ?? ''));
		if (message) return fail(400, { name, message });
		start_session(name, cookies);
		redirect(303, `/${name}`);
	}
};
