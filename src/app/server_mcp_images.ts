import type { DocumentNode } from 'svedit';
import { ASSET_ID_REGEX, MAX_IMAGE_WIDTH, VARIANT_WIDTHS } from './config.js';
import { asset_exists, asset_webp_dimensions } from './services.js';
import { create_upload_token } from './server_oauth.js';

/**
 * Instructions and a short-lived token for uploading an image over HTTP.
 * Image bytes cannot travel through tool calls, so agents prepare the same
 * files the editor produces in the browser and upload them directly.
 */
export async function prepare_image_upload(origin: string, grant_id: string) {
	const { upload_token, expires_at } = await create_upload_token(grant_id);
	const authorization = `Bearer ${upload_token}`;
	return {
		upload_token,
		expires_at: new Date(expires_at * 1000).toISOString(),
		steps: [
			`Scale the image down to at most ${MAX_IMAGE_WIDTH}px wide, keeping its aspect ratio, and encode it as WebP at quality 80, like the editor does. This is the original.`,
			`For every width in ${VARIANT_WIDTHS.join(', ')} that is smaller than the original, encode a WebP scaled to exactly that width.`,
			'The asset id is the SHA-256 hex digest of the original file plus ".webp".',
			`POST the original to ${origin}/api/assets with the headers Authorization, Content-Type: image/webp, X-Content-Hash (the digest), X-Asset-Width, and X-Asset-Height, and the file as the body.`,
			`POST every variant to ${origin}/api/assets/<asset id>/variants with Authorization, Content-Type: image/webp, and X-Variant-Width.`,
			'Use the image in write_document or create_page as <image src="<asset id>" mime_type="image/webp" width="<original width>" height="<original height>" alt="<description>"/>. Writes are rejected while variants are missing or width and height do not match the file.'
		],
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
export async function assert_uploaded_images(nodes: DocumentNode[]) {
	for (const node of nodes) {
		if ((node.type !== 'image' && node.type !== 'video') || !node.src) continue;
		if (!ASSET_ID_REGEX.test(node.src) || !(await asset_exists(node.src)))
			throw new Error(
				`${node.type} ${node.id}: ${node.src} is not an uploaded asset. Use prepare_image_upload to add new images.`
			);
		if (node.type !== 'image' || !node.src.endsWith('.webp')) continue;

		const actual = await asset_webp_dimensions(node.src);
		if (actual && (actual.width !== node.width || actual.height !== node.height))
			throw new Error(
				`image ${node.id}: width and height (${node.width}×${node.height}) do not match ${node.src} (${actual.width}×${actual.height}).`
			);
		const missing = [];
		for (const width of VARIANT_WIDTHS)
			if (width < node.width && !(await asset_exists(node.src, `w${width}.webp`)))
				missing.push(width);
		if (missing.length)
			throw new Error(
				`image ${node.id}: ${node.src} is missing variants ${missing.join(', ')}. Upload them before saving.`
			);
	}
}
