import { expect, it } from 'vitest';
import { webp_bytes } from '#app/test_helpers/webp.js';
import { webp_dimensions } from './webp.js';

function header(chunk: string, payload: number[]) {
	const bytes = new Uint8Array(30);
	bytes.set([...`RIFF\0\0\0\0WEBP${chunk}`].map((char) => char.charCodeAt(0)));
	bytes.set(payload, 20);
	return bytes;
}

it('reads dimensions from lossy, lossless, and extended WebP headers', () => {
	const lossy = header('VP8 ', [
		0,
		0,
		0,
		0x9d,
		0x01,
		0x2a,
		640 & 0xff,
		640 >> 8,
		480 & 0xff,
		480 >> 8
	]);
	const bits = (100 - 1) | ((50 - 1) << 14);
	const lossless = header('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, 0]);

	expect(webp_dimensions(lossy)).toEqual({ width: 640, height: 480 });
	expect(webp_dimensions(lossless)).toEqual({ width: 100, height: 50 });
	expect(webp_dimensions(webp_bytes(1431, 1908))).toEqual({ width: 1431, height: 1908 });
	expect(webp_dimensions(new TextEncoder().encode('GIF89a'.padEnd(30)))).toBeNull();
});
