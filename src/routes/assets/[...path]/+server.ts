import { error } from '@sveltejs/kit';
import { extname } from 'node:path';
import { EXT_TO_MIME } from '#app/config.js';
import { asset_exists, backend } from '#app/services.js';
import type { RequestHandler } from './$types';

// Served assets are user-uploaded content. `nosniff` prevents a payload from
// being interpreted as a different, executable type. Directly-opened images
// additionally get `sandbox` so active formats such as SVG cannot run code
// against the site. Do not sandbox videos: Chromium's built-in media document
// becomes an opaque origin and then blocks its own byte-range requests via
// CORS, making otherwise valid MP4/WebM files unplayable in a new tab.
const NO_SNIFF_HEADERS = {
	'X-Content-Type-Options': 'nosniff'
};

const INERT_CONTENT_HEADERS = {
	'Content-Security-Policy': 'sandbox',
	...NO_SNIFF_HEADERS
};

/** Extensions a variant's original can have (variants exist only for images). */
const IMAGE_EXTS = Object.keys(EXT_TO_MIME).filter((ext) => EXT_TO_MIME[ext].startsWith('image/'));
const VIDEO_EXTS = Object.keys(EXT_TO_MIME).filter((ext) => EXT_TO_MIME[ext].startsWith('video/'));

/**
 * Extract the first 8 hex characters from an asset id for Content-Disposition filename.
 */
function short_filename(asset_id: string, ext: string): string {
	return `${asset_id.slice(0, 8)}${ext}`;
}

/**
 * Parse a single HTTP byte range header.
 */
function parse_byte_range(
	range_header: string | null,
	size: number
): { start: number; end: number } | null {
	if (!range_header) return null;

	const match = range_header.trim().match(/^bytes=(\d*)-(\d*)$/);
	if (!match) return null;

	const start_str = match[1];
	const end_str = match[2];

	// Suffix range: bytes=-500
	if (!start_str && end_str) {
		const suffix_length = Number(end_str);
		if (!Number.isInteger(suffix_length) || suffix_length <= 0) return null;
		const start = Math.max(size - suffix_length, 0);
		return { start, end: size - 1 };
	}

	if (!start_str) return null;

	const start = Number(start_str);
	if (!Number.isInteger(start) || start < 0 || start >= size) return null;

	let end = size - 1;
	if (end_str) {
		end = Number(end_str);
		if (!Number.isInteger(end) || end < start) return null;
		end = Math.min(end, size - 1);
	}

	return { start, end };
}

export const GET: RequestHandler = async ({ params, request }) => {
	const path = params.path;

	if (!path) {
		error(400, 'Missing asset path');
	}

	// Video poster request: {stem}/poster.webp
	const poster_match = path.match(/^([a-f0-9]{64})\/poster\.webp$/);
	if (poster_match) {
		const asset_stem = poster_match[1];
		let video_id: string | null = null;
		for (const ext of VIDEO_EXTS) {
			if (await asset_exists(`${asset_stem}.${ext}`)) {
				video_id = `${asset_stem}.${ext}`;
				break;
			}
		}
		const poster = video_id && (await backend.read_asset(video_id, { variant: 'poster.webp' }));
		if (!poster) {
			error(404, 'Video poster not found');
		}

		return new Response(poster, {
			headers: {
				...INERT_CONTENT_HEADERS,
				'Content-Type': 'image/webp',
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Content-Disposition': `inline; filename="${short_filename(asset_stem, '.webp')}"`
			}
		});
	}

	// Variant request: {stem}/w{width}.webp
	const variant_match = path.match(/^([a-f0-9]{64})\/w(\d+)\.webp$/);
	if (variant_match) {
		const asset_stem = variant_match[1];
		const width = parseInt(variant_match[2], 10);

		// Find the original asset id by checking known image extensions
		let original_id: string | null = null;
		for (const ext of IMAGE_EXTS) {
			if (await asset_exists(`${asset_stem}.${ext}`)) {
				original_id = `${asset_stem}.${ext}`;
				break;
			}
		}

		if (!original_id) {
			error(404, 'Asset not found');
		}

		const stream = await backend.read_asset(original_id, { variant: `w${width}.webp` });
		if (!stream) {
			error(404, 'Variant not found');
		}

		return new Response(stream, {
			headers: {
				...INERT_CONTENT_HEADERS,
				'Content-Type': 'image/webp',
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Content-Disposition': `inline; filename="${short_filename(asset_stem, '.webp')}"`
			}
		});
	}

	// Original request: {hash}.{ext}
	const original_match = path.match(/^([a-f0-9]{64}\.\w+)$/);
	if (!original_match) {
		error(400, 'Invalid asset path');
	}

	const asset_id = original_match[1];

	const size = await backend.asset_size(asset_id);
	if (size === null) {
		error(404, 'Asset not found');
	}

	const ext = extname(asset_id);
	const mime_type = EXT_TO_MIME[ext.slice(1)] || 'application/octet-stream';
	const range_header = request.headers.get('range');
	const is_video = mime_type.startsWith('video/');
	const byte_range = is_video ? parse_byte_range(range_header, size) : null;

	const headers: Record<string, string> = {
		...(is_video ? NO_SNIFF_HEADERS : INERT_CONTENT_HEADERS),
		'Content-Type': mime_type,
		'Cache-Control': 'public, max-age=31536000, immutable',
		'Content-Disposition': `inline; filename="${short_filename(asset_id, ext)}"`
	};

	// Video files need range request support for seeking
	if (is_video) {
		headers['Accept-Ranges'] = 'bytes';
	}

	if (range_header && is_video) {
		if (!byte_range) {
			return new Response(null, {
				status: 416,
				headers: {
					...headers,
					'Content-Range': `bytes */${size}`
				}
			});
		}

		const { start, end } = byte_range;
		const stream = await backend.read_asset(asset_id, { range: { start, end } });
		const partial_size = end - start + 1;

		return new Response(stream, {
			status: 206,
			headers: {
				...headers,
				'Content-Length': String(partial_size),
				'Content-Range': `bytes ${start}-${end}/${size}`
			}
		});
	}

	const stream = await backend.read_asset(asset_id);
	return new Response(stream, {
		headers: {
			...headers,
			'Content-Length': String(size)
		}
	});
};
