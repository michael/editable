import { error } from '@sveltejs/kit';
import { ASSET_ID_REGEX } from '#app/config.js';
import { asset_exists, backend } from '#app/services.js';
import { require_user } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	require_user(locals);

	const { asset_id } = params;

	if (!ASSET_ID_REGEX.test(asset_id)) {
		error(400, 'Invalid asset id');
	}

	if (!(await asset_exists(asset_id))) {
		error(404, 'Asset not found');
	}

	await backend.delete_asset(asset_id);
	return Response.json({ ok: true });
};
