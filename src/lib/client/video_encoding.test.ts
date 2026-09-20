import { describe, expect, it } from 'vitest';
import { MAX_VIDEO_FILESIZE, OPTIMIZED_VIDEO_REGEX } from '#app/config.js';
import {
	choose_encoding,
	preferred_bitrate,
	retry_bitrate,
	sample_ranges,
	should_preserve_video,
	VIDEO_BUDGET_SAFETY
} from './video_encoding.js';

describe('automatic video planning', () => {
	it('keeps a 30 MiB, 30-second 1080p H.264 export', () => {
		expect(
			should_preserve_video(30 * 1024 ** 2, 30, 1920 * 1080, 30, 'avc', MAX_VIDEO_FILESIZE)
		).toBe(true);
	});

	it('does not preserve a raw 1 GiB clip or an oversized efficient export', () => {
		expect(should_preserve_video(1024 ** 3, 30, 3840 * 2160, 30, 'avc', MAX_VIDEO_FILESIZE)).toBe(
			false
		);
		expect(
			should_preserve_video(MAX_VIDEO_FILESIZE + 1, 600, 1920 * 1080, 30, 'avc', MAX_VIDEO_FILESIZE)
		).toBe(false);
	});

	it('gives a short 1440p clip a quality budget far below the size ceiling', () => {
		const bitrate = preferred_bitrate(2560 * 1440, 30, 'avc');
		expect(((bitrate + 128_000) * 30) / 8).toBeLessThan(MAX_VIDEO_FILESIZE / 3);
		const encoding = choose_encoding(3840, 2160, 30, 25_000_000, 1440, 'avc');
		expect(encoding.short_side).toBe(1440);
	});

	it('reduces resolution to fit a ten-minute clip while reserving audio', () => {
		const budget = (MAX_VIDEO_FILESIZE * 8 * VIDEO_BUDGET_SAFETY) / 600 - 128_000;
		const encoding = choose_encoding(2560, 1440, 30, budget, 1440, 'avc');
		expect(encoding.short_side).toBeLessThan(1440);
		expect(encoding.short_side).toBeGreaterThanOrEqual(540);
		expect(((encoding.bitrate + 128_000) * 600) / 8).toBeLessThan(MAX_VIDEO_FILESIZE);
	});

	it('uses the full video budget after lowering resolution for a fifteen-minute clip', () => {
		const budget = (MAX_VIDEO_FILESIZE * 8 * VIDEO_BUDGET_SAFETY) / 900 - 128_000;
		const encoding = choose_encoding(2560, 1440, 30, budget, 1440, 'avc', true);
		expect(encoding.short_side).toBeLessThan(1440);
		expect(encoding.bitrate).toBe(Math.floor(budget));
		expect(((encoding.bitrate + 128_000) * 900) / 8).toBeCloseTo(MAX_VIDEO_FILESIZE * 0.95, -3);
	});

	it('does not upscale and treats portrait and landscape equally', () => {
		expect(choose_encoding(320, 180, 24, 1_000_000, 1440, 'avc').short_side).toBe(180);
		expect(choose_encoding(1440, 2560, 30, 1_000_000, 1440, 'vp9')).toEqual(
			choose_encoding(2560, 1440, 30, 1_000_000, 1440, 'vp9')
		);
	});

	it('reduces retry budgets and samples multiple portions of a long clip', () => {
		expect(retry_bitrate(1_000_000, 110, 100)).toBe(Math.floor((1_000_000 * 90) / 110));
		expect(sample_ranges(5)).toEqual([]);
		const ranges = sample_ranges(600);
		expect(ranges).toHaveLength(3);
		expect(ranges[0].start).toBeLessThan(100);
		expect(ranges[2].start).toBeGreaterThan(500);
		expect(ranges.every(({ start, end }) => start >= 0 && end <= 600)).toBe(true);
	});

	it('recognizes manual MP4 and WebM suffixes only at the end of the filename', () => {
		for (const name of ['surfer_optimized.mp4', 'surfer_optimized.webm', 'surfer.optimized.MP4']) {
			expect(OPTIMIZED_VIDEO_REGEX.test(name)).toBe(true);
		}
		for (const name of ['optimized_surfer.mp4', 'surfer_optimized.draft.mp4', 'surfer.mp4']) {
			expect(OPTIMIZED_VIDEO_REGEX.test(name)).toBe(false);
		}
	});
});
