import { error, fail, redirect } from '@sveltejs/kit';
import { fill_document_defaults, validate_document } from 'svedit';
import { VERCEL } from '$app/env/private';
import { document_schema, MEDIA_DEFAULTS } from '#app/document_schema.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (VERCEL) error(404, 'Not found');
	if (!locals.user) {
		const { site } = await import('#app/server_site.js');
		const { resolve_href } = await import('#app/document_links.js');
		redirect(303, resolve_href('/login?redirect_to=/meter-readings', site));
	}
	const { get_shared_documents } = await import('#app/api.remote.js');
	const { banner_document, nav_document, footer_document } = await get_shared_documents();
	const document_id = 'meter-readings-page';
	const image_id = 'meter-readings-page-image';
	// The route supplies the body; the document supplies metadata and the site's banner, nav, and footer.
	const document = fill_document_defaults(
		{
			document_id,
			nodes: {
				...structuredClone(banner_document.nodes),
				...structuredClone(nav_document.nodes),
				...structuredClone(footer_document.nodes),
				[image_id]: { id: image_id, type: 'image', ...MEDIA_DEFAULTS },
				[document_id]: {
					id: document_id,
					type: 'page',
					image: image_id,
					title: { content: 'Meter readings', marks: [], annotations: [] },
					banner: banner_document.document_id,
					nav: nav_document.document_id,
					footer: footer_document.document_id
				}
			}
		},
		document_schema
	);
	validate_document(document, document_schema);

	const { readings_of } = await import('#app/meter_readings/store.js');
	return {
		document,
		slug: 'meter-readings',
		can_edit: false,
		readings: await readings_of(locals.user.username as string)
	};
};

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
		const { add_reading } = await import('#app/meter_readings/store.js');
		await add_reading(username, meter, value);
		return { reported: true };
	}
};
