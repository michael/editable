// Minimal S3 client for the automated backup layer. The whole layer is
// enabled by the presence of BUCKET_NAME; without it every export is a
// no-op or error.
//
// Also imported by the plain-node boot/restore scripts in scripts/ via
// relative paths — keep this file free of #lib imports (the alias only
// resolves inside the bundled app).

import { openAsBlob } from 'node:fs';
import { AwsClient } from 'aws4fetch';

export function s3_enabled() {
	return Boolean(process.env.BUCKET_NAME);
}

// The automatic backup triggers (asset mirror, daily snapshot) run only in
// the deployed runtime — marked by the production entrypoint (run-cloud-boot
// via start-app.js), which dev servers and local previews never pass through.
// Local processes must never write to the bucket, even with credentials in
// .env; reads (pull-cloud, restore-assets) stay available everywhere.
export function backup_enabled() {
	return s3_enabled() && process.env.EDITABLE_DEPLOYED === '1';
}

let client: AwsClient | undefined;

function aws() {
	if (!client) {
		client = new AwsClient({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
			region: process.env.AWS_REGION || 'auto',
			service: 's3'
		});
	}
	return client;
}

// Path-style URLs (endpoint/bucket/key) work across Tigris, R2, MinIO and AWS.
function bucket_url(suffix = '') {
	const endpoint = (
		process.env.AWS_ENDPOINT_URL_S3 || `https://s3.${process.env.AWS_REGION}.amazonaws.com`
	).replace(/\/+$/, '');
	return `${endpoint}/${process.env.BUCKET_NAME}/${suffix}`;
}

/**
 * Upload a buffer to the bucket.
 */
export async function put_object(key: string, body: Buffer | Uint8Array) {
	// Buffer is a Uint8Array at runtime; TS's BodyInit just doesn't name it.
	const res = await aws().fetch(bucket_url(key), {
		method: 'PUT',
		body: body as unknown as BodyInit
	});
	if (!res.ok) throw new Error(`S3 PUT ${key}: ${res.status} ${await res.text()}`);
}

/**
 * Stream a file from disk to the bucket without buffering the whole file in memory.
 */
export async function put_file(key: string, file_path: string) {
	const body = await openAsBlob(file_path);
	const res = await aws().fetch(bucket_url(key), {
		method: 'PUT',
		headers: { 'Content-Length': String(body.size) },
		body
	});
	if (!res.ok) throw new Error(`S3 PUT ${key}: ${res.status} ${await res.text()}`);
}

/**
 * Download an object as a buffer.
 */
export async function get_object(key: string): Promise<Buffer> {
	const res = await aws().fetch(bucket_url(key));
	if (!res.ok) throw new Error(`S3 GET ${key}: ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

/**
 * List all object keys under a prefix (paginated).
 */
export async function list_keys(prefix: string): Promise<string[]> {
	const keys: string[] = [];
	let token: string | undefined;
	do {
		const params = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': '1000' });
		if (token) params.set('continuation-token', token);
		const res = await aws().fetch(bucket_url(`?${params}`));
		if (!res.ok) throw new Error(`S3 LIST ${prefix}: ${res.status} ${await res.text()}`);
		const xml = await res.text();
		for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(decode_xml(m[1]));
		token = (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1];
	} while (token);
	return keys;
}

// Asset keys are hex hashes and "w<width>.webp" — this covers the general case anyway.
function decode_xml(s: string) {
	return s
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', "'")
		.replaceAll('&amp;', '&');
}

/**
 * Fire-and-forget mirror of a file to the bucket, used by the upload path.
 * Never throws and never blocks — a bucket hiccup must not fail the user's
 * upload; the boot sweep repairs any miss.
 */
export function mirror_file(key: string, file_path: string) {
	if (!backup_enabled()) return;
	put_file(key, file_path).catch((err) => {
		console.error(`[backup] Asset mirror failed for ${key} (boot sweep will retry):`, err.message);
	});
}
