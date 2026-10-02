import { unlink } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { ASSET_ID_REGEX } from '#app/config.js';
import { asset_exists, poster_path, write_poster } from '#app/services.js';
import { require_admin_session } from '#lib/server/auth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	require_admin_session(locals);

	const { asset_id } = params;
	if (!ASSET_ID_REGEX.test(asset_id)) {
		error(400, 'Invalid asset id');
	}
	if (!asset_id.endsWith('.mp4') && !asset_id.endsWith('.webm')) {
		error(400, 'Posters are only supported for videos');
	}
	if (!asset_exists(asset_id)) {
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
		write_result = await write_poster(asset_id, request.body);
	} catch (err) {
		await unlink(poster_path(asset_id)).catch(() => {});
		console.error('Failed to write video poster to disk:', err);
		error(500, 'Failed to store video poster');
	}
	if (write_result.bytes_written === 0) {
		await unlink(poster_path(asset_id)).catch(() => {});
		error(400, 'Empty poster data');
	}

	return Response.json({ ok: true, poster: 'poster.webp' });
};
