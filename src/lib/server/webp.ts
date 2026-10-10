import { closeSync, openSync, readSync } from 'node:fs';

const HEADER_BYTES = 30;

function read_uint24(bytes: Uint8Array, offset: number) {
	return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

/** Read pixel dimensions from a WebP header, or null if the bytes are not a WebP image. */
export function webp_dimensions(bytes: Uint8Array): { width: number; height: number } | null {
	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (bytes.length < HEADER_BYTES || ascii(0, 4) !== 'RIFF' || ascii(8, 12) !== 'WEBP') return null;

	const chunk = ascii(12, 16);
	// Extended format: 24-bit canvas width and height minus one.
	if (chunk === 'VP8X') {
		return { width: read_uint24(bytes, 24) + 1, height: read_uint24(bytes, 27) + 1 };
	}
	// Lossless: 14-bit width and height minus one, packed after the 0x2f signature.
	if (chunk === 'VP8L' && bytes[20] === 0x2f) {
		const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
		return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
	}
	// Lossy: 14-bit width and height after the 0x9d012a start code.
	if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
		return {
			width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
			height: (bytes[28] | (bytes[29] << 8)) & 0x3fff
		};
	}
	return null;
}

export function read_webp_dimensions(file_path: string) {
	const bytes = new Uint8Array(HEADER_BYTES);
	const fd = openSync(file_path, 'r');
	try {
		readSync(fd, bytes, 0, HEADER_BYTES, 0);
	} finally {
		closeSync(fd);
	}
	return webp_dimensions(bytes);
}
