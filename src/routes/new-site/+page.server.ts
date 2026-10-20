import { error, fail, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (VERCEL) error(404, 'Not found');
};

// One form creates a site or logs in to it, depending on whether the name exists.
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (VERCEL) error(404, 'Not found');
		const { create_site, log_in_site, site_exists, site_origin, start_session } =
			await import('../../host/sites.js');
		const data = await request.formData();
		const name = String(data.get('name') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');

		if (site_exists(name)) {
			if (!(await log_in_site(name, password, cookies)))
				return fail(400, { name, message: 'Incorrect password.' });
		} else {
			const message = await create_site(name, password);
			if (message) return fail(400, { name, message });
			await start_session(name, cookies);
		}
		const origin = site_origin(name);
		// The site is another origin, so it is allowlisted rather than `external: true`.
		redirect(303, origin, { external: [origin] });
	}
};
