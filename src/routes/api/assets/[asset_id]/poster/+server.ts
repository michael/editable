import { error } from '@sveltejs/kit';
import { ASSET_ID_REGEX } from '#app/config.js';
import { asset_exists, backend } from '#app/services.js';
import { require_user } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	require_user(locals);

	const { asset_id } = params;
	if (!ASSET_ID_REGEX.test(asset_id)) {
		error(400, 'Invalid asset id');
	}
	if (!asset_id.endsWith('.mp4') && !asset_id.endsWith('.webm')) {
		error(400, 'Posters are only supported for videos');
	}
	if (!(await asset_exists(asset_id))) {
		error(404, 'Asset not found');
	}

	const content_type = (request.headers.get('content-type') ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	if (content_type !== 'image/webp') {
		error(400, 'Poster must be image/webp');
	}
	if (!request.body) {
		error(400, 'Empty request body');
	}

	let write_result;
	try {
		write_result = await backend.write_asset(asset_id, request.body, 'poster.webp');
	} catch (err) {
		await backend.delete_asset(asset_id, 'poster.webp').catch(() => {});
		console.error('Failed to store video poster:', err);
		error(500, 'Failed to store video poster');
	}
	if (write_result.bytes_written === 0) {
		await backend.delete_asset(asset_id, 'poster.webp').catch(() => {});
		error(400, 'Empty poster data');
	}

	return Response.json({ ok: true, poster: 'poster.webp' });
};
