import { error, fail, redirect } from '@sveltejs/kit';
import { VERCEL } from '$app/env/private';
import { is_site_name } from '../../host/site_names.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	if (VERCEL) error(404, 'Not found');
};

// One form, two steps: the name alone tells whether to create or to log in,
// and the name with a password does it.
export const actions: Actions = {
	default: async ({ request, cookies }) => {
		if (VERCEL) error(404, 'Not found');
		const { create_site, log_in_site, site_exists, site_origin, start_session } =
			await import('../../host/sites.js');
		const data = await request.formData();
		const name = String(data.get('name') ?? '')
			.trim()
			.toLowerCase();
		const password = data.get('password');
		if (!is_site_name(name))
			return fail(400, {
				name,
				message:
					'A site name is 3 to 30 lowercase letters, digits, and dashes, starting with a letter.'
			});
		const exists = site_exists(name);
		if (password === null) return { name, exists };

		if (exists) {
			if (!log_in_site(name, String(password), cookies))
				return fail(400, { name, exists, message: 'Incorrect password.' });
		} else {
			const message = create_site(name, String(password));
			if (message) return fail(400, { name, exists, message });
			start_session(name, cookies);
		}
		const origin = site_origin(name);
		// The site is another origin, so it is allowlisted rather than `external: true`.
		redirect(303, origin, { external: [origin] });
	}
};
