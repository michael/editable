import { existsSync } from 'node:fs';
import type { DocumentNode } from 'svedit';
import { create_upload_token } from '#lib/server/upload_token.js';
import { read_webp_dimensions } from '#lib/server/webp.js';
import { ASSET_ID_REGEX, MAX_IMAGE_WIDTH, VARIANT_WIDTHS } from './config.js';
import { asset_exists, asset_path, variant_path } from './services.js';

const UPLOAD_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Instructions and a short-lived token for uploading an image over HTTP.
 * Image bytes cannot travel through tool calls, so agents prepare the same
 * files the editor produces in the browser and upload them directly.
 */
export function prepare_image_upload(origin: string, secret: string) {
	const expires_at = Date.now() + UPLOAD_TOKEN_TTL_MS;
	const upload_token = create_upload_token(secret, expires_at);
	const authorization = `Bearer ${upload_token}`;
	return {
		upload_token,
		expires_at: new Date(expires_at).toISOString(),
		spec: {
			format: 'image/webp',
			// Matches the editor's in-browser encoder.
			quality: 80,
			max_width: MAX_IMAGE_WIDTH,
			variant_widths: VARIANT_WIDTHS
		},
		steps: [
			`Scale the image down to at most ${MAX_IMAGE_WIDTH}px wide, keeping its aspect ratio, and encode it as WebP at quality 80. This is the original.`,
			'For every width in variant_widths that is smaller than the original width, encode a WebP scaled to exactly that width.',
			'The asset id is the SHA-256 hex digest of the original file plus ".webp".',
			'Upload the original, then every variant, with the requests below.',
			'Use the image in save_page or create_page as { type: "image", src: <asset id>, mime_type: "image/webp", width, height, alt }. Saves are rejected while variants are missing or width and height do not match the file.'
		],
		upload_original: {
			method: 'POST',
			url: `${origin}/api/assets`,
			headers: {
				Authorization: authorization,
				'Content-Type': 'image/webp',
				'X-Content-Hash': '<SHA-256 hex of the original>',
				'X-Asset-Width': '<original width>',
				'X-Asset-Height': '<original height>'
			},
			body: 'The original WebP file'
		},
		upload_variant: {
			method: 'POST',
			url: `${origin}/api/assets/<asset id>/variants`,
			headers: {
				Authorization: authorization,
				'Content-Type': 'image/webp',
				'X-Variant-Width': '<variant width>'
			},
			body: 'The variant WebP file'
		},
		example: [
			`curl -X POST ${origin}/api/assets -H "Authorization: ${authorization}" -H "Content-Type: image/webp" -H "X-Content-Hash: $(shasum -a 256 original.webp | cut -d' ' -f1)" -H "X-Asset-Width: 2048" -H "X-Asset-Height: 1365" --data-binary @original.webp`,
			`curl -X POST ${origin}/api/assets/<asset id>/variants -H "Authorization: ${authorization}" -H "Content-Type: image/webp" -H "X-Variant-Width: 640" --data-binary @w640.webp`
		]
	};
}

/**
 * New or changed media must reference uploaded assets. WebP images must also
 * match their file's dimensions and have every variant their srcset requests.
 */
export function assert_uploaded_images(nodes: DocumentNode[]) {
	for (const node of nodes) {
		if ((node.type !== 'image' && node.type !== 'video') || !node.src) continue;
		if (!ASSET_ID_REGEX.test(node.src) || !asset_exists(node.src))
			throw new Error(
				`${node.type} ${node.id}: ${node.src} is not an uploaded asset. Use prepare_image_upload to add new images.`
			);
		if (node.type !== 'image' || !node.src.endsWith('.webp')) continue;

		const actual = read_webp_dimensions(asset_path(node.src));
		if (actual && (actual.width !== node.width || actual.height !== node.height))
			throw new Error(
				`image ${node.id}: width and height (${node.width}×${node.height}) do not match ${node.src} (${actual.width}×${actual.height}).`
			);
		const missing = VARIANT_WIDTHS.filter(
			(width) => width < node.width && !existsSync(variant_path(node.src, width))
		);
		if (missing.length)
			throw new Error(
				`image ${node.id}: ${node.src} is missing variants ${missing.join(', ')}. Upload them before saving.`
			);
	}
}
