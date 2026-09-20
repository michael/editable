export type ProcessedVideo = {
	blob: Blob;
	poster: Blob;
	width: number;
	height: number;
	passthrough: boolean;
};

export type ProcessVideoOptions = {
	max_resolution: number;
	max_filesize: number;
	onStatus?: (status: string) => void;
	onProgress?: (progress: number) => void;
};

/**
 * Transcode a video file off the main thread using a Web Worker.
 * Keeps WebM inputs as WebM; other formats become MP4 (H.264 + AAC).
 * Prefers quality within MAX_VIDEO_RESOLUTION and verifies MAX_VIDEO_FILESIZE.
 * Files that are already web-optimized are detected and passed through
 * (as-is for MP4/WebM, with video remuxing for other containers like MOV).
 */
export function process_video(file: File, options: ProcessVideoOptions): Promise<ProcessedVideo> {
	const { max_resolution, max_filesize, onStatus, onProgress } = options;

	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./video_processor.ts', import.meta.url), { type: 'module' });

		worker.addEventListener('message', (e) => {
			const msg = e.data;

			if (msg.type === 'status') {
				onStatus?.(msg.status);
				return;
			}

			if (msg.type === 'progress') {
				onProgress?.(msg.progress);
				return;
			}

			if (msg.type === 'error') {
				worker.terminate();
				reject(new Error(msg.error));
				return;
			}

			if (msg.type === 'result') {
				worker.terminate();
				resolve({
					// Passthrough: the file is already a suitable MP4 or WebM —
					// upload the original bytes untouched.
					blob: msg.passthrough ? file : new Blob([msg.buffer], { type: msg.mime_type }),
					poster: new Blob([msg.poster_buffer], { type: 'image/webp' }),
					width: msg.width,
					height: msg.height,
					passthrough: Boolean(msg.passthrough)
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
			max_resolution,
			max_filesize
		});
	});
}

/**
 * Generate a WebP poster from the first decoded frame of an explicitly
 * pre-optimized video without changing its bytes.
 */
export function create_video_poster(file: File): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./video_processor.ts', import.meta.url), { type: 'module' });

		worker.addEventListener('message', (e) => {
			const msg = e.data;
			if (msg.type === 'error') {
				worker.terminate();
				reject(new Error(msg.error));
			} else if (msg.type === 'poster') {
				worker.terminate();
				resolve(new Blob([msg.poster_buffer], { type: 'image/webp' }));
			}
		});

		worker.addEventListener('error', (e) => {
			worker.terminate();
			reject(new Error(e.message || 'Worker error'));
		});

		worker.postMessage({ type: 'poster', file });
	});
}
