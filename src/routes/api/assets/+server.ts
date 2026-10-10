import { error } from '@sveltejs/kit';
import { MCP_API_KEY } from '$app/env/private';
import { MAX_IMAGE_WIDTH, UPLOAD_MIME_TO_EXT } from '#app/config.js';
import { asset_exists, asset_path, write_asset, delete_asset } from '#app/services.js';
import { authorize_asset_upload } from '#lib/server/upload_token.js';
import { read_webp_dimensions } from '#lib/server/webp.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const authorized_by = authorize_asset_upload(request, locals, MCP_API_KEY);

	const content_type_raw = request.headers.get('content-type') ?? '';
	const content_type = content_type_raw.split(';')[0].trim().toLowerCase();

	// Agents prepare images themselves, following the WebP spec from prepare_image_upload.
	if (authorized_by === 'upload_token' && content_type !== 'image/webp') {
		error(400, 'Uploads with an upload token must be image/webp.');
	}

	const ext = UPLOAD_MIME_TO_EXT[content_type];
	if (!ext) {
		error(
			400,
			`Unsupported content type: ${content_type}. Expected one of: ${Object.keys(UPLOAD_MIME_TO_EXT).join(', ')}.`
		);
	}

	const hash = request.headers.get('x-content-hash');
	if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
		error(400, 'Missing or invalid X-Content-Hash header (expected SHA-256 hex)');
	}

	const width = parseInt(request.headers.get('x-asset-width') ?? '', 10);
	const height = parseInt(request.headers.get('x-asset-height') ?? '', 10);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		error(400, 'Missing or invalid X-Asset-Width / X-Asset-Height headers');
	}

	const asset_id = `${hash}.${ext}`;

	// Deduplication: if the file already exists, skip the upload
	if (asset_exists(asset_id)) {
		// Drain the request body without buffering
		if (request.body) {
			const reader = request.body.getReader();
			while (!(await reader.read()).done) {
				/* drain */
			}
		}

		return Response.json({ asset_id, width, height, deduplicated: true });
	}

	if (!request.body) {
		error(400, 'Empty request body');
	}

	// Stream the request body directly to disk
	let write_result;
	try {
		write_result = await write_asset(asset_id, request.body);
	} catch (err) {
		await delete_asset(asset_id).catch(() => {});
		console.error('Failed to write asset to disk:', err);
		error(500, 'Failed to store asset');
	}

	if (write_result.bytes_written === 0) {
		await delete_asset(asset_id).catch(() => {});
		error(400, 'Empty file');
	}

	// Enforce content-addressing: the stored bytes must hash to the claimed id.
	if (write_result.sha256 !== hash) {
		await delete_asset(asset_id).catch(() => {});
		error(400, 'Content does not match X-Content-Hash');
	}

	if (authorized_by === 'upload_token') {
		const actual = read_webp_dimensions(asset_path(asset_id));
		const problem = !actual
			? 'The file is not a valid WebP image.'
			: actual.width !== width || actual.height !== height
				? `X-Asset-Width/X-Asset-Height (${width}×${height}) do not match the image (${actual.width}×${actual.height}).`
				: actual.width > MAX_IMAGE_WIDTH
					? `Images may be at most ${MAX_IMAGE_WIDTH}px wide. Resize the original before uploading.`
					: null;
		if (problem) {
			await delete_asset(asset_id).catch(() => {});
			error(400, problem);
		}
	}

	return Response.json({ asset_id, width, height, deduplicated: false });
};
