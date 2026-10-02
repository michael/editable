import { error } from '@sveltejs/kit';
import { ASSET_ID_REGEX } from '#app/config.js';
import { delete_asset, asset_exists } from '#app/services.js';
import { require_admin_session } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	require_admin_session(locals);

	const { asset_id } = params;

	if (!ASSET_ID_REGEX.test(asset_id)) {
		error(400, 'Invalid asset id');
	}

	if (!asset_exists(asset_id)) {
		error(404, 'Asset not found');
	}

	await delete_asset(asset_id);
	return Response.json({ ok: true });
};
