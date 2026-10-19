import { fail } from '@sveltejs/kit';
import { require_user } from '#app/server_auth.js';
import { add_reading, readings_of } from '#app/meter_readings/store.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	readings: await readings_of(require_user(event).username as string)
});

export const actions: Actions = {
	// Anyone signed in to the app reports readings; editing the website is separate.
	default: async ({ request, locals }) => {
		const username = locals.user?.username as string | undefined;
		if (!username) return fail(401, { message: 'Log in to report a reading.' });
		const form = await request.formData();
		const meter = String(form.get('meter') ?? '').trim();
		const value = Number(form.get('value'));
		if (!meter || !Number.isFinite(value) || value < 0)
			return fail(400, { message: 'Enter a meter number and a reading of 0 or more.' });
		await add_reading(username, meter, value);
		return { reported: true };
	}
};
