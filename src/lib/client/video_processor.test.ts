import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_FILESIZE } from '#app/config.js';

const state = vi.hoisted(() => ({
	format: 'mp4',
	codec: 'avc',
	duration: 30,
	width: 2560,
	height: 1440,
	output_sizes: [] as number[],
	sample_size: 1000,
	conversions: [] as any[],
	discarded: [] as any[],
	audio: false,
	listener: null as null | ((event: any) => void),
	messages: [] as any[],
	finish: null as null | ((message: any) => void)
}));

vi.mock('mediabunny', async (import_original) => {
	const actual = await import_original<typeof import('mediabunny')>();
	const video_track = {
		getDisplayWidth: async () => state.width,
		getDisplayHeight: async () => state.height,
		getCodec: async () => state.codec,
		canDecode: async () => true,
		canBeTransparent: async () => false,
		computePacketStats: async () => ({ averagePacketRate: 30 })
	};
	const audio_track = {
		getCodec: async () => 'aac',
		computePacketStats: async () => ({ averageBitrate: 320_000 })
	};
	return {
		...actual,
		Input: class {
			getPrimaryVideoTrack = async () => video_track;
			getVideoTracks = async () => [video_track];
			getAudioTracks = async () => (state.audio ? [audio_track] : []);
			computeDuration = async () => state.duration;
			getFormat = async () =>
				state.format === 'webm' ? new actual.WebMInputFormat() : new actual.Mp4InputFormat();
			dispose() {}
		},
		canEncodeVideo: async () => true,
		canEncodeAudio: async () => true,
		Output: class {
			constructor(public options: any) {}
		},
		Conversion: {
			init: async (options: any) => {
				state.conversions.push(options);
				return {
					isValid: true,
					discardedTracks: state.discarded,
					execute: async () => {
						options.output.options.target.buffer = new ArrayBuffer(
							options.trim ? state.sample_size : (state.output_sizes.shift() ?? 1000)
						);
					}
				};
			}
		},
		VideoSampleSink: class {
			async *samples() {
				yield {
					displayWidth: 1,
					displayHeight: 1,
					close() {},
					toCanvasImageSource() {
						return {};
					}
				};
			}
		}
	};
});
vi.mock('@jsquash/webp', () => ({ encode: async () => new ArrayBuffer(1) }));
vi.mock('@mediabunny/aac-encoder', () => ({ registerAacEncoder: vi.fn() }));

beforeEach(async () => {
	vi.resetModules();
	Object.assign(state, {
		format: 'mp4',
		codec: 'avc',
		duration: 30,
		width: 2560,
		height: 1440,
		output_sizes: [],
		conversions: [],
		discarded: [],
		audio: false,
		messages: [],
		sample_size: 1000
	});
	vi.stubGlobal('self', {
		addEventListener: (_type: string, listener: typeof state.listener) => {
			state.listener = listener;
		},
		postMessage: (message: any) => {
			state.messages.push(message);
			if (message.type === 'result' || message.type === 'error') state.finish?.(message);
		}
	});
	vi.stubGlobal(
		'OffscreenCanvas',
		class {
			width = 1;
			height = 1;
			getContext() {
				return {
					drawImage() {},
					getImageData() {
						return {};
					}
				};
			}
		}
	);
	await import('./video_processor.js');
});
afterEach(() => vi.unstubAllGlobals());

function process_file(size = 1024 ** 3, max_filesize = MAX_VIDEO_FILESIZE) {
	const file = new File([], `video.${state.format}`, { type: `video/${state.format}` });
	Object.defineProperty(file, 'size', { value: size });
	return new Promise<any>((resolve) => {
		state.finish = resolve;
		state.listener!({ data: { type: 'process', file, max_resolution: 1440, max_filesize } });
	});
}

describe('video worker', () => {
	it('preserves a 30 MiB surfer clip without encoding', async () => {
		state.width = 1920;
		state.height = 1080;
		const result = await process_file(30 * 1024 ** 2);
		expect(result.passthrough).toBe(true);
		expect(state.conversions).toHaveLength(0);
	});

	it('keeps WebM output and retains 1440p when samples fit', async () => {
		state.format = 'webm';
		state.codec = 'vp9';
		const result = await process_file();
		expect(result.type).toBe('result');
		expect(result.mime_type).toBe('video/webm');
		expect(state.conversions.filter((conversion) => conversion.trim)).toHaveLength(3);
		const final_conversion = state.conversions.at(-1);
		expect(final_conversion.video.codec).toBe('vp9');
		expect(final_conversion.video.height).toBeUndefined();
		expect(result.height).toBe(1440);
	});

	it('retries an oversized encode from the same original and only returns a fitting file', async () => {
		state.duration = 0.1;
		state.output_sizes = [1_100_000, 800_000];
		const result = await process_file(1024 ** 3, 1_000_000);
		expect(result.buffer.byteLength).toBe(800_000);
		expect(state.conversions).toHaveLength(2);
		expect(state.conversions[0].input).toBe(state.conversions[1].input);
	});

	it('fails after bounded retries instead of returning an oversized file', async () => {
		state.duration = 0.1;
		state.output_sizes = [1_100_000, 1_100_000, 1_100_000];
		const result = await process_file(1024 ** 3, 1_000_000);
		expect(result.type).toBe('error');
		expect(state.conversions).toHaveLength(3);
		expect(state.messages.some((message) => message.type === 'result')).toBe(false);
	});

	it('keeps a compatible original when savings are marginal', async () => {
		state.duration = 0.1;
		state.output_sizes = [800_000];
		const result = await process_file(1_000_000);
		expect(result.passthrough).toBe(true);
	});

	it('accepts an undersized long video without another full encode', async () => {
		state.duration = 900;
		state.sample_size = 2_000_000;
		state.audio = true;
		state.output_sizes = [75_000_000];
		const result = await process_file();
		expect(result.buffer.byteLength).toBe(75_000_000);
		expect(state.conversions.filter((conversion) => !conversion.trim)).toHaveLength(1);
	});

	it('retries an oversized long video, then accepts the fitting result', async () => {
		state.duration = 900;
		state.sample_size = 2_000_000;
		state.audio = true;
		state.output_sizes = [105_000_000, 92_000_000];
		const result = await process_file();
		expect(result.buffer.byteLength).toBe(92_000_000);
		const full_conversions = state.conversions.filter((conversion) => !conversion.trim);
		expect(full_conversions).toHaveLength(2);
		expect(full_conversions[1].input).toBe(full_conversions[0].input);
	});

	it('does not spend an extra pass on a long video already using 90% of the limit', async () => {
		state.duration = 900;
		state.sample_size = 2_000_000;
		state.output_sizes = [90_000_000];
		const result = await process_file();
		expect(result.buffer.byteLength).toBe(90_000_000);
		expect(state.conversions.filter((conversion) => !conversion.trim)).toHaveLength(1);
	});

	it('rejects discarded audio instead of silently losing sound', async () => {
		state.duration = 0.1;
		state.audio = true;
		state.discarded = [{ track: { type: 'audio' }, reason: 'undecodable_source' }];
		const result = await process_file();
		expect(result.type).toBe('error');
		expect(result.error).toContain('without losing tracks');
	});

	it('rejects unknown duration instead of using an unlimited budget', async () => {
		state.duration = Infinity;
		const result = await process_file();
		expect(result.type).toBe('error');
		expect(state.conversions).toHaveLength(0);
	});
});
