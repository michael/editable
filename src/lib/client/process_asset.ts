export type ProcessedAsset = {
	original: { blob: Blob; width: number; height: number };
	variants: Array<{ width: number; blob: Blob }>;
};

export type ProcessOptions = {
	max_width: number;
	variant_widths: number[];
	onStatus?: (status: string) => void;
};

/**
 * Process an image file off the main thread using a Web Worker.
 * Decodes, resizes, encodes to WebP, and generates all configured size variants.
 */
export function process_asset(file: File, options: ProcessOptions): Promise<ProcessedAsset> {
	const { max_width, variant_widths, onStatus } = options;

	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./asset_processor.ts', import.meta.url), {
			type: 'module'
		});

		worker.addEventListener('message', (e) => {
			const msg = e.data;

			if (msg.type === 'status') {
				onStatus?.(msg.status);
				return;
			}

			if (msg.type === 'error') {
				worker.terminate();
				reject(new Error(msg.error));
				return;
			}

			if (msg.type === 'result') {
				worker.terminate();

				const original_blob = new Blob([msg.original.buffer], { type: 'image/webp' });
				const variants = msg.variants.map((v: { width: number; buffer: ArrayBuffer }) => ({
					width: v.width,
					blob: new Blob([v.buffer], { type: 'image/webp' })
				}));

				resolve({
					original: {
						blob: original_blob,
						width: msg.original.width,
						height: msg.original.height
					},
					variants
				});
			}
		});

		worker.addEventListener('error', (e) => {
			worker.terminate();
			reject(new Error(e.message || 'Worker error'));
		});

		worker.postMessage({
			type: 'process',
			file,
			max_width,
			variant_widths
		});
	});
}
