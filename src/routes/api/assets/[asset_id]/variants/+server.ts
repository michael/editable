import { unlink } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { ASSET_ID_REGEX, VARIANT_WIDTHS_SET } from '#app/config.js';
import { asset_exists, write_variant, variant_path } from '#app/services.js';
import { authorize_asset_upload } from '#app/server_oauth.js';
import { read_webp_dimensions } from '#lib/server/webp.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const authorized_by = authorize_asset_upload(request, locals);

	const { asset_id } = params;

	if (!ASSET_ID_REGEX.test(asset_id)) {
		error(400, 'Invalid asset id');
	}

	// Validate the original asset exists on disk
	if (!asset_exists(asset_id)) {
		error(404, 'Asset not found');
	}

	// Validate content type
	const content_type = (request.headers.get('content-type') ?? '')
		.split(';')[0]
		.trim()
		.toLowerCase();
	if (content_type !== 'image/webp') {
		error(400, 'Variant must be image/webp');
	}

	// Validate variant width from header
	const width_str = request.headers.get('x-variant-width');
	if (!width_str) {
		error(400, 'Missing X-Variant-Width header');
	}

	const width = parseInt(width_str, 10);
	if (!Number.isFinite(width) || width <= 0) {
		error(400, 'Invalid X-Variant-Width value');
	}

	if (!VARIANT_WIDTHS_SET.has(width)) {
		error(400, `Width ${width} is not an allowed variant width`);
	}

	if (!request.body) {
		error(400, 'Empty request body');
	}

	// Stream the variant directly to disk
	let write_result;
	try {
		write_result = await write_variant(asset_id, width, request.body);
	} catch (err) {
		await unlink(variant_path(asset_id, width)).catch(() => {});
		console.error('Failed to write variant to disk:', err);
		error(500, 'Failed to store variant');
	}

	if (write_result.bytes_written === 0) {
		await unlink(variant_path(asset_id, width)).catch(() => {});
		error(400, 'Empty variant data');
	}

	if (authorized_by === 'upload_token') {
		const actual = read_webp_dimensions(variant_path(asset_id, width));
		if (actual?.width !== width) {
			await unlink(variant_path(asset_id, width)).catch(() => {});
			error(
				400,
				actual
					? `X-Variant-Width (${width}) does not match the image width (${actual.width}).`
					: 'The variant is not a valid WebP image.'
			);
		}
	}

	const variant = `w${width}.webp`;
	return Response.json({ ok: true, variant });
};
