import { error } from '@sveltejs/kit';
import { MAX_IMAGE_WIDTH, UPLOAD_MIME_TO_EXT } from '#app/config.js';
import { asset_exists, asset_webp_dimensions, backend } from '#app/services.js';
import { authorize_asset_upload } from '#app/server_oauth.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const authorized_by = await authorize_asset_upload(request, locals);

	const content_type_raw = request.headers.get('content-type') ?? '';
	const content_type = content_type_raw.split(';')[0].trim().toLowerCase();

	// Agents prepare images themselves, following prepare_image_upload: WebP, or an SVG as it is.
	if (
		authorized_by === 'upload_token' &&
		content_type !== 'image/webp' &&
		content_type !== 'image/svg+xml'
	) {
		error(400, 'Uploads with an upload token must be image/webp or image/svg+xml.');
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
	if (await asset_exists(asset_id)) {
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

	// Stream the request body directly to the backend
	let write_result;
	try {
		write_result = await backend.write_asset(asset_id, request.body);
	} catch (err) {
		await backend.delete_asset(asset_id).catch(() => {});
		console.error('Failed to store asset:', err);
		error(500, 'Failed to store asset');
	}

	if (write_result.bytes_written === 0) {
		await backend.delete_asset(asset_id).catch(() => {});
		error(400, 'Empty file');
	}

	// Enforce content-addressing: the stored bytes must hash to the claimed id.
	if (write_result.sha256 !== hash) {
		await backend.delete_asset(asset_id).catch(() => {});
		error(400, 'Content does not match X-Content-Hash');
	}

	if (authorized_by === 'upload_token' && ext === 'svg') {
		// The root element comes early; reading a bounded start keeps large uploads out of memory.
		const stream = await backend.read_asset(asset_id, { range: { start: 0, end: 65535 } });
		if (!/<svg[\s>]/.test(await new Response(stream).text())) {
			await backend.delete_asset(asset_id).catch(() => {});
			error(400, 'The file is not an SVG image.');
		}
	} else if (authorized_by === 'upload_token') {
		const actual = await asset_webp_dimensions(asset_id);
		const problem = !actual
			? 'The file is not a valid WebP image.'
			: actual.width !== width || actual.height !== height
				? `X-Asset-Width/X-Asset-Height (${width}×${height}) do not match the image (${actual.width}×${actual.height}).`
				: actual.width > MAX_IMAGE_WIDTH
					? `Images may be at most ${MAX_IMAGE_WIDTH}px wide. Resize the original before uploading.`
					: null;
		if (problem) {
			await backend.delete_asset(asset_id).catch(() => {});
			error(400, problem);
		}
	}

	return Response.json({ asset_id, width, height, deduplicated: false });
};
