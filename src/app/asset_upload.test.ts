import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_FILESIZE } from '#app/config.js';
import { start_processing, upload_pending } from './asset_upload.js';
import { create_video_poster, process_video } from '#lib/client/process_video.js';

vi.mock('#lib/client/process_video.js', () => ({
	create_video_poster: vi.fn(async () => new Blob(['poster'], { type: 'image/webp' })),
	process_video: vi.fn(async () => ({
		blob: new Blob(['encoded'], { type: 'video/webm' }),
		poster: new Blob(['poster'], { type: 'image/webp' }),
		width: 2560,
		height: 1440,
		passthrough: false
	}))
}));
vi.mock('#lib/client/media_dimensions.js', () => ({
	get_video_dimensions: async () => ({ width: 3840, height: 2160 }),
	get_media_dimensions: vi.fn()
}));
vi.mock('#lib/client/process_asset.js', () => ({ process_asset: vi.fn() }));

let uploads: Array<{ blob: Blob; headers: Record<string, string> }>;
beforeEach(() => {
	vi.clearAllMocks();
	uploads = [];
	vi.stubGlobal(
		'XMLHttpRequest',
		class {
			status = 200;
			responseText = '';
			headers: Record<string, string> = {};
			listeners: Record<string, () => void> = {};
			addEventListener(event: string, callback: () => void) {
				this.listeners[event] = callback;
			}
			open() {}
			setRequestHeader(key: string, value: string) {
				this.headers[key] = value;
			}
			send(blob: Blob) {
				uploads.push({ blob, headers: this.headers });
				this.responseText = JSON.stringify({
					asset_id: `${this.headers['X-Content-Hash']}.${blob.type === 'video/webm' ? 'webm' : 'mp4'}`
				});
				this.listeners.load();
			}
		}
	);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('video uploads', () => {
	it.each(['mp4', 'webm'])('preserves marked %s bytes and 4K dimensions', async (extension) => {
		const file = new File(['original'], `surfer_optimized.${extension}`, {
			type: `video/${extension}`
		});
		const url = `blob:manual-${extension}`;
		await start_processing(url, file);
		const mapping = await upload_pending([url]);
		expect(process_video).not.toHaveBeenCalled();
		expect(create_video_poster).toHaveBeenCalledWith(file);
		expect(uploads[0].blob).toBe(file);
		expect(uploads[0].headers['Content-Type']).toBe(`video/${extension}`);
		expect(mapping.get(url)?.asset_id).toMatch(new RegExp(`\\.${extension}$`));
		expect(mapping.get(url)?.height).toBe(2160);
	});

	it('rejects oversized manual exports without altering them', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const file = new File([], 'surfer_optimized.webm', { type: 'video/webm' });
		Object.defineProperty(file, 'size', { value: MAX_VIDEO_FILESIZE + 1 });
		await start_processing('blob:oversized-manual', file);
		await expect(upload_pending(['blob:oversized-manual'])).rejects.toThrow('at most 100 MiB');
		expect(process_video).not.toHaveBeenCalled();
		expect(uploads).toHaveLength(0);
	});

	it('routes unmarked WebM through optimization and uploads the correct MIME type', async () => {
		const file = new File(['source'], 'surfer.webm', { type: 'video/webm' });
		await start_processing('blob:auto-webm', file);
		const mapping = await upload_pending(['blob:auto-webm']);
		expect(process_video).toHaveBeenCalledWith(
			file,
			expect.objectContaining({ max_filesize: MAX_VIDEO_FILESIZE, max_resolution: 1440 })
		);
		expect(uploads[0].headers['Content-Type']).toBe('video/webm');
		expect(mapping.get('blob:auto-webm')?.asset_id).toMatch(/\.webm$/);
	});
});
