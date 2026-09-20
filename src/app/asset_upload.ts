import { process_asset } from '#lib/client/process_asset.js';
import { create_video_poster, process_video } from '#lib/client/process_video.js';
import type { ProcessVideoOptions, ProcessedVideo } from '#lib/client/process_video.js';
import {
	EXT_TO_MIME,
	MAX_IMAGE_WIDTH,
	MAX_VIDEO_INPUT_BYTES,
	MAX_VIDEO_FILESIZE,
	MAX_VIDEO_RESOLUTION,
	OPTIMIZED_VIDEO_REGEX,
	VARIANT_WIDTHS
} from '#app/config.js';
import { get_video_dimensions, get_media_dimensions } from '#lib/client/media_dimensions.js';
import type { DocumentNode } from 'svedit';

export type PendingAsset = {
	hash: string;
	asset_id: string;
	original: { blob: Blob; width: number; height: number };
	poster: Blob | null;
	variants: Array<{ width: number; blob: Blob }>;
	status: 'processing' | 'ready' | 'error';
	progress: number;
	error: string | null;
};

/** The result of a successful asset upload. */
export type UploadedAsset = { asset_id: string; width: number; height: number };

/**
 * Map of blob URL → PendingAsset. Populated when images are pasted/dropped,
 * consulted during the save flow to upload and replace blob URLs.
 */
const pending_assets = new Map<string, PendingAsset>();

/**
 * Compute SHA-256 hex hash of a Blob.
 */
async function hash_blob(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const hash_buffer = await crypto.subtle.digest('SHA-256', buffer);
	const hash_array = Array.from(new Uint8Array(hash_buffer));
	return hash_array.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Detect whether a GIF file is animated by counting Graphic Control Extension blocks.
 */
async function is_animated_gif(file: File): Promise<boolean> {
	if (file.type !== 'image/gif') return false;
	const buffer = await file.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let count = 0;
	for (let i = 0; i < bytes.length - 1; i++) {
		if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) {
			count++;
			if (count > 1) return true;
		}
	}
	return false;
}

/**
 * Determine the stored file extension for a given file.
 */
function get_stored_extension(file: File, animated: boolean): string {
	if (file.type === 'image/svg+xml') return 'svg';
	if (file.type === 'image/gif' && animated) return 'gif';
	// All other raster images get converted to WebP
	return 'webp';
}

/**
 * Check if a file is a video based on MIME type.
 */
function is_video(file: File): boolean {
	return file.type.startsWith('video/');
}

/**
 * Check if a video file is marked as already web-optimized via the filename
 * convention (e.g. my_video_optimized.mp4 or clip_optimized.webm).
 * Such files are uploaded as-is if they fit within the size limit.
 */
function is_preoptimized_video(file: File): boolean {
	return ['video/mp4', 'video/webm'].includes(file.type) && OPTIMIZED_VIDEO_REGEX.test(file.name);
}

/**
 * Serialize video transcode jobs: parallel transcodes would compete for
 * memory and hardware encoders, so run them one at a time.
 */
let video_queue: Promise<unknown> = Promise.resolve();

function enqueue_video_processing(
	file: File,
	options: Omit<ProcessVideoOptions, 'max_resolution' | 'max_filesize'>
): Promise<ProcessedVideo> {
	const job = video_queue.then(() =>
		process_video(file, {
			max_resolution: MAX_VIDEO_RESOLUTION,
			max_filesize: MAX_VIDEO_FILESIZE,
			...options
		})
	);
	// Keep the queue chain alive even if this job fails
	video_queue = job.catch(() => {});
	return job;
}

/**
 * Start background processing for a pasted/dropped media file.
 * Call this from handle_media_paste. The blob_url (the blob: URL set as the
 * media node's src) is used as the key to look up the processing result
 * during the save flow.
 */
export async function start_processing(blob_url: string, file: File) {
	const entry: PendingAsset = {
		hash: '',
		asset_id: '',
		original: { blob: file, width: 0, height: 0 },
		poster: null,
		variants: [],
		status: 'processing',
		progress: 0,
		error: null
	};
	pending_assets.set(blob_url, entry);

	if (is_video(file)) {
		try {
			if (is_preoptimized_video(file)) {
				// Escape hatch: filename marks the file as already optimized —
				// upload the raw bytes without transcoding, at any resolution.
				if (file.size > MAX_VIDEO_FILESIZE) {
					throw new Error(
						'Manually optimized videos must be at most 100 MB. Reduce the file size or remove the _optimized suffix to use automatic compression.'
					);
				}
				const [hash, dims] = await Promise.all([hash_blob(file), get_video_dimensions(file)]);
				entry.hash = hash;
				entry.asset_id = `${hash}.${file.type === 'video/webm' ? 'webm' : 'mp4'}`;
				entry.original = { blob: file, width: dims.width, height: dims.height };
				entry.poster = await create_video_poster(file);
			} else {
				if (file.size > MAX_VIDEO_INPUT_BYTES) {
					const max_gb = MAX_VIDEO_INPUT_BYTES / (1024 * 1024 * 1024);
					throw new Error(
						`Video is too large to convert in the browser (max ${max_gb} GB). Please compress it first.`
					);
				}
				const result = await enqueue_video_processing(file, {
					onProgress: (progress) => {
						entry.progress = progress;
					}
				});
				// The asset id must be the SHA-256 of the stored (transcoded) bytes —
				// the server verifies this on upload.
				entry.hash = await hash_blob(result.blob);
				entry.asset_id = `${entry.hash}.${result.blob.type === 'video/webm' ? 'webm' : 'mp4'}`;
				entry.original = { blob: result.blob, width: result.width, height: result.height };
				entry.poster = result.poster;
			}
			entry.variants = [];
			entry.progress = 1;
			entry.status = 'ready';
		} catch (err) {
			entry.status = 'error';
			entry.error = err instanceof Error ? err.message : 'Video processing failed';
			console.error(`Video processing failed for ${blob_url}:`, err);
		}
		return;
	}

	try {
		const is_svg = file.type === 'image/svg+xml';
		const animated = await is_animated_gif(file);
		const ext = get_stored_extension(file, animated);

		if (is_svg || animated) {
			// Passthrough — no WASM processing
			const [hash, dims] = await Promise.all([hash_blob(file), get_media_dimensions(file)]);
			entry.hash = hash;
			entry.original = { blob: file, width: dims.width, height: dims.height };
			entry.variants = [];
		} else {
			// Static raster image — process via WASM worker. The hash is computed
			// over the re-encoded blob: the asset id must always be the SHA-256 of
			// the stored bytes (the server verifies this on upload).
			const result = await process_asset(file, {
				max_width: MAX_IMAGE_WIDTH,
				variant_widths: VARIANT_WIDTHS
			});
			entry.hash = await hash_blob(result.original.blob);
			entry.original = result.original;
			entry.variants = result.variants;
		}

		entry.asset_id = `${entry.hash}.${ext}`;
		entry.status = 'ready';
	} catch (err) {
		entry.status = 'error';
		entry.error = err instanceof Error ? err.message : 'Processing failed';
		console.error(`Asset processing failed for ${blob_url}:`, err);
	}
}

/**
 * Check if there are any assets still being processed.
 */
export function has_pending_processing(): boolean {
	for (const entry of pending_assets.values()) {
		if (entry.status === 'processing') return true;
	}
	return false;
}

export type ProcessingProgressCallback = (progress: {
	done: number;
	total: number;
	progress: number;
}) => void;

/**
 * Wait until all pending assets have finished processing.
 * The reported progress is the average completion across all entries (0–1);
 * video transcodes report incremental progress, other entries count as
 * 0 while processing and 1 when done.
 */
export async function wait_for_processing(on_progress?: ProcessingProgressCallback): Promise<void> {
	while (has_pending_processing()) {
		if (on_progress) {
			let done = 0;
			let total = 0;
			let progress_sum = 0;
			for (const entry of pending_assets.values()) {
				total++;
				if (entry.status !== 'processing') {
					done++;
					progress_sum += 1;
				} else {
					progress_sum += entry.progress;
				}
			}
			on_progress({ done, total, progress: total > 0 ? progress_sum / total : 1 });
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/**
 * Upload a blob using XHR with progress tracking.
 */
function upload_blob(
	url: string,
	blob: Blob,
	headers: Record<string, string>,
	on_progress?: (progress: number) => void
): Promise<any> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		if (on_progress) {
			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					on_progress(Math.round((e.loaded / e.total) * 100));
				}
			});
		}
		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(JSON.parse(xhr.responseText));
			} else {
				let message = `Upload failed: ${xhr.status}`;
				try {
					const body = JSON.parse(xhr.responseText);
					if (body.message) message = body.message;
				} catch {
					/* ignore */
				}
				reject(new Error(message));
			}
		});
		xhr.addEventListener('error', () => reject(new Error('Upload failed (network error)')));

		xhr.open('POST', url);
		for (const [key, value] of Object.entries(headers)) {
			xhr.setRequestHeader(key, value);
		}
		xhr.send(blob);
	});
}

/**
 * Upload a single asset (original + variants) to the server.
 * Returns the asset_id on success.
 */
async function upload_asset(entry: PendingAsset): Promise<UploadedAsset> {
	const ext = entry.asset_id.slice(entry.asset_id.lastIndexOf('.') + 1);
	const content_type = EXT_TO_MIME[ext];

	// Upload original
	const result = await upload_blob('/api/assets', entry.original.blob, {
		'Content-Type': content_type,
		'X-Content-Hash': entry.hash,
		'X-Asset-Width': String(entry.original.width),
		'X-Asset-Height': String(entry.original.height)
	});

	// Videos have one derived poster. Upload it even for a deduplicated video
	// so older content-addressed assets can gain a poster on their next save.
	if (entry.poster) {
		try {
			await upload_blob(`/api/assets/${result.asset_id}/poster`, entry.poster, {
				'Content-Type': 'image/webp'
			});
		} catch (err) {
			if (!result.deduplicated) {
				await fetch(`/api/assets/${result.asset_id}`, { method: 'DELETE' }).catch(() => {});
			}
			throw new Error(`Poster upload failed: ${err instanceof Error ? err.message : err}`, {
				cause: err
			});
		}
	}

	// If deduplicated, image variants were already uploaded with the original.
	if (result.deduplicated) {
		return {
			asset_id: result.asset_id,
			width: entry.original.width,
			height: entry.original.height
		};
	}

	// Upload image variants sequentially
	for (let i = 0; i < entry.variants.length; i++) {
		const variant = entry.variants[i];
		try {
			await upload_blob(`/api/assets/${result.asset_id}/variants`, variant.blob, {
				'Content-Type': 'image/webp',
				'X-Variant-Width': String(variant.width)
			});
		} catch (err) {
			// Clean up the partially uploaded asset
			try {
				await fetch(`/api/assets/${result.asset_id}`, { method: 'DELETE' });
			} catch {
				/* best effort cleanup */
			}
			throw new Error(
				`Variant upload failed (w${variant.width}): ${err instanceof Error ? err.message : err}`,
				{ cause: err }
			);
		}
	}

	return { asset_id: result.asset_id, width: entry.original.width, height: entry.original.height };
}

export type UploadProgressCallback = (progress: {
	phase: 'uploading';
	index: number;
	total: number;
}) => void;

/**
 * Upload pending assets that are referenced in the document.
 * Only uploads entries whose blob URL appears in the provided list.
 * Throws on the first failure (after cleaning up the failed asset).
 */
export async function upload_pending(
	blob_urls: string[],
	on_progress?: UploadProgressCallback
): Promise<Map<string, UploadedAsset>> {
	const mapping = new Map<string, UploadedAsset>();
	const total = blob_urls.length;

	for (let i = 0; i < blob_urls.length; i++) {
		const blob_url = blob_urls[i];
		const entry = pending_assets.get(blob_url);
		if (!entry) {
			throw new Error(`No pending asset found for ${blob_url}`);
		}
		if (entry.status === 'error') {
			throw new Error(`Asset processing failed: ${entry.error}`);
		}
		if (entry.status !== 'ready') {
			throw new Error('Some assets are still processing');
		}

		if (on_progress) {
			on_progress({ phase: 'uploading', index: i + 1, total });
		}

		const result = await upload_asset(entry);
		mapping.set(blob_url, result);
	}

	return mapping;
}

/**
 * Replace blob URLs in document nodes with asset ids using the upload mapping.
 * Also updates width, height and mime_type to the processed values (e.g. a
 * dropped .mov is stored as video/mp4 after transcoding).
 * The nodes map is mutated in place.
 */
export function replace_blob_urls(
	nodes: Record<string, DocumentNode>,
	mapping: Map<string, UploadedAsset>
) {
	for (const node of Object.values(nodes)) {
		if (
			(node.type === 'image' || node.type === 'video') &&
			typeof node.src === 'string' &&
			node.src.startsWith('blob:')
		) {
			const entry = mapping.get(node.src);
			if (entry) {
				const ext = entry.asset_id.slice(entry.asset_id.lastIndexOf('.') + 1);
				node.src = entry.asset_id;
				node.width = entry.width;
				node.height = entry.height;
				if (EXT_TO_MIME[ext]) {
					node.mime_type = EXT_TO_MIME[ext];
				}
			}
		}
	}
}

/**
 * Ensure all blob URLs have pending asset entries. For any blob URL
 * that's missing from the map (e.g. after undo brought back blob URLs
 * that were cleaned up after a previous save), re-fetch the blob and
 * restart processing.
 */
export async function ensure_processing(blob_urls: string[]): Promise<void> {
	for (const blob_url of blob_urls) {
		if (pending_assets.has(blob_url)) continue;

		// Re-fetch the blob from the still-valid blob URL
		try {
			const response = await fetch(blob_url);
			const blob = await response.blob();
			const fallback_type = blob.type || 'image/png';
			const fallback_name = fallback_type.startsWith('video/') ? 'pasted-video' : 'pasted-image';
			const file = new File([blob], fallback_name, { type: fallback_type });
			start_processing(blob_url, file);
		} catch (err) {
			console.error(`Failed to re-process asset for ${blob_url}:`, err);
			// Create a failed entry so upload_pending will report the error
			pending_assets.set(blob_url, {
				hash: '',
				asset_id: '',
				original: { blob: new Blob(), width: 0, height: 0 },
				poster: null,
				variants: [],
				status: 'error',
				progress: 0,
				error: `Failed to re-fetch blob URL: ${err instanceof Error ? err.message : err}`
			});
		}
	}
}

/**
 * Collect all blob URLs from media nodes in a document.
 */
export function collect_blob_urls(nodes: Record<string, DocumentNode>): string[] {
	const blob_urls: string[] = [];
	for (const node of Object.values(nodes)) {
		if (
			(node.type === 'image' || node.type === 'video') &&
			typeof node.src === 'string' &&
			node.src.startsWith('blob:')
		) {
			blob_urls.push(node.src);
		}
	}
	return blob_urls;
}

/**
 * Clean up completed entries from the pending map.
 * Call after a successful save.
 */
export function cleanup_pending(mapping: Map<string, UploadedAsset>) {
	for (const blob_url of mapping.keys()) {
		pending_assets.delete(blob_url);
	}
}
