/** A minimal extended-format (VP8X) WebP header with the given canvas size. */
export function webp_bytes(width: number, height: number): Uint8Array<ArrayBuffer> {
	const bytes = new Uint8Array(64);
	const ascii = (text: string, offset: number) =>
		bytes.set(
			[...text].map((char) => char.charCodeAt(0)),
			offset
		);
	ascii('RIFF', 0);
	ascii('WEBP', 8);
	ascii('VP8X', 12);
	const uint24 = (value: number, offset: number) =>
		bytes.set([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff], offset);
	uint24(width - 1, 24);
	uint24(height - 1, 27);
	return bytes;
}
