import {
	Input,
	Output,
	Conversion,
	ALL_FORMATS,
	BlobSource,
	BufferSource,
	BufferTarget,
	Mp4InputFormat,
	Mp4OutputFormat,
	WebMInputFormat,
	WebMOutputFormat,
	Quality,
	canEncodeVideo,
	VideoSampleSink,
	canEncodeAudio
} from 'mediabunny';
import { encode as encode_webp } from '@jsquash/webp';
import { registerAacEncoder } from '@mediabunny/aac-encoder';
import type { ConversionVideoOptions, ConversionAudioOptions } from 'mediabunny';

import {
	choose_encoding,
	preferred_bitrate,
	refinement_bitrate,
	retry_bitrate,
	sample_ranges,
	should_preserve_video,
	VIDEO_BUDGET_SAFETY
} from './video_encoding.js';
import type { OutputVideoCodec } from './video_encoding.js';

const POSTER_WEBP_QUALITY = 80;

function post_status(status: string) {
	self.postMessage({ type: 'status', status });
}

/**
 * Build resize options for a target short side. Only one dimension is
 * passed so mediabunny deduces the other from the aspect ratio — this
 * avoids letterboxing and rounding mismatches.
 */
function build_resize_options(
	display_width: number,
	display_height: number,
	short_side: number
): { width?: number; height?: number } {
	if (Math.min(display_width, display_height) <= short_side) return {};
	return display_width < display_height ? { width: short_side } : { height: short_side };
}

/**
 * Read the display dimensions of the primary video track from a transcoded
 * buffer, so the reported dimensions exactly match the stored file.
 */
async function read_output_dimensions(
	buffer: ArrayBuffer
): Promise<{ width: number; height: number } | null> {
	const output_input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
	try {
		const track = await output_input.getPrimaryVideoTrack();
		if (!track) return null;
		const width = await track.getDisplayWidth();
		const height = await track.getDisplayHeight();
		return { width, height };
	} finally {
		output_input.dispose();
	}
}

/**
 * Decode the first available video frame and encode it as the video's poster.
 */
async function create_poster(source: Blob): Promise<ArrayBuffer> {
	const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
	try {
		const video_track = await input.getPrimaryVideoTrack();
		if (!video_track || !(await video_track.canDecode())) {
			throw new Error('Could not decode a video frame for the poster.');
		}
		const sink = new VideoSampleSink(video_track);
		for await (const sample of sink.samples()) {
			try {
				const canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
				const context = canvas.getContext('2d');
				if (!context) throw new Error('Could not create a canvas for the video poster.');
				context.drawImage(sample.toCanvasImageSource(), 0, 0);
				return await encode_webp(context.getImageData(0, 0, canvas.width, canvas.height), {
					quality: POSTER_WEBP_QUALITY
				});
			} finally {
				sample.close();
			}
		}
		throw new Error('Could not decode a video frame for the poster.');
	} finally {
		input.dispose();
	}
}

/**
 * Handle a transcode request from the main thread.
 */
async function handle_process(data: { file: File; max_resolution: number; max_filesize: number }) {
	const { file, max_resolution, max_filesize } = data;
	const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

	try {
		post_status('Analyzing video…');
		const video_track = await input.getPrimaryVideoTrack();
		if (!video_track) throw new Error('No video track found in this file.');
		if (!(await video_track.canDecode())) {
			throw new Error('This video format cannot be decoded by your browser.');
		}

		const display_width = await video_track.getDisplayWidth();
		const display_height = await video_track.getDisplayHeight();
		const duration = await input.computeDuration();
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error('Could not determine the video duration for automatic compression.');
		}
		const format = await input.getFormat();
		const is_webm = format instanceof WebMInputFormat;
		const mime_type = is_webm ? 'video/webm' : 'video/mp4';
		const source_codec = await video_track.getCodec();
		const stats = await video_track.computePacketStats(100);
		const source_frame_rate =
			Number.isFinite(stats.averagePacketRate) && stats.averagePacketRate > 0
				? stats.averagePacketRate
				: 30;
		const frame_rate = Math.min(source_frame_rate, 30);
		const top = Math.min(display_width, display_height, max_resolution);
		const aspect =
			Math.max(display_width, display_height) / Math.min(display_width, display_height);
		const audio_tracks = await input.getAudioTracks();
		const audio_codec = is_webm ? 'opus' : 'aac';
		const audio_bitrate_per_track = is_webm ? 96_000 : 128_000;
		const audio_codecs = await Promise.all(audio_tracks.map((track) => track.getCodec()));
		const compatible_video = is_webm
			? source_codec === 'vp8' || source_codec === 'vp9' || source_codec === 'av1'
			: source_codec === 'avc';
		const compatible_audio = audio_codecs.every((codec) =>
			is_webm ? codec === 'opus' || codec === 'vorbis' : codec === 'aac'
		);
		const can_keep_original =
			compatible_video &&
			compatible_audio &&
			(is_webm || format instanceof Mp4InputFormat) &&
			file.size <= max_filesize;

		async function send_original() {
			post_status('Generating video poster…');
			const poster_buffer = await create_poster(file);
			self.postMessage(
				{
					type: 'result',
					passthrough: true,
					width: display_width,
					height: display_height,
					poster_buffer
				},
				{ transfer: [poster_buffer] }
			);
		}

		// Preserve efficient exports even above the preferred resolution. Re-encoding
		// cannot restore lost detail, and file size alone is not a quality measure.
		const efficient_video =
			compatible_video &&
			should_preserve_video(
				file.size,
				duration,
				top * Math.round(top * aspect),
				frame_rate,
				source_codec as OutputVideoCodec,
				max_filesize
			);
		if (can_keep_original && efficient_video) {
			await send_original();
			return;
		}

		async function send_output(buffer: ArrayBuffer) {
			post_status('Generating video poster…');
			const dims = await read_output_dimensions(buffer);
			const poster_buffer = await create_poster(new Blob([buffer], { type: mime_type }));
			self.postMessage(
				{
					type: 'result',
					buffer,
					mime_type,
					width: dims?.width ?? display_width,
					height: dims?.height ?? display_height,
					poster_buffer
				},
				{ transfer: [buffer, poster_buffer] }
			);
		}

		if ((await input.getVideoTracks()).length !== 1) {
			throw new Error('Automatic compression requires a file with one video track.');
		}
		// Browser encoders cannot reliably preserve WebM alpha. Keep its bytes
		// when possible rather than silently flattening a transparent upload.
		if (is_webm && (await video_track.canBeTransparent())) {
			if (can_keep_original) {
				await send_original();
				return;
			}
			throw new Error('Transparent WebM exceeds the size limit. Please optimize it manually.');
		}

		let codec: OutputVideoCodec = 'avc';
		if (is_webm) {
			const candidates: OutputVideoCodec[] =
				source_codec === 'av1' ? ['av1', 'vp9', 'vp8'] : ['vp9', 'vp8'];
			const supported = [];
			for (const candidate of candidates) {
				if (await canEncodeVideo(candidate)) supported.push(candidate);
			}
			if (!supported.length) {
				if (can_keep_original) {
					await send_original();
					return;
				}
				throw new Error(
					'This browser cannot encode WebM. Please upload a manually optimized WebM.'
				);
			}
			codec = supported[0];
		}
		if (audio_tracks.length && audio_codec === 'aac' && !(await canEncodeAudio('aac'))) {
			registerAacEncoder();
		}

		const audio_stats = await Promise.all(
			audio_tracks.map((track) => track.computePacketStats(100))
		);
		const copy_audio = audio_tracks.map(
			(_, index) =>
				audio_codecs[index] === audio_codec &&
				audio_stats[index].averageBitrate > 0 &&
				audio_stats[index].averageBitrate <= audio_bitrate_per_track
		);
		const audio_bitrate = audio_tracks.reduce(
			(sum, _, index) =>
				sum + (copy_audio[index] ? audio_stats[index].averageBitrate : audio_bitrate_per_track),
			0
		);
		let budget_bitrate = (max_filesize * 8 * VIDEO_BUDGET_SAFETY) / duration - audio_bitrate;
		if (budget_bitrate < 10_000) {
			throw new Error('This video is too long to fit within the size limit with its audio tracks.');
		}
		const preferred = preferred_bitrate(top * Math.round(top * aspect), frame_rate, codec);
		// Quantizer control adapts the byte count to the footage. The explicit
		// bitrate is a fallback for browsers without quantizer support, not a cap.
		const preferred_quality = new Quality({
			quantizer: codec === 'avc' ? 26 : codec === 'av1' ? 128 : 32,
			bitrate: preferred
		});
		const base_video: ConversionVideoOptions = {
			codec,
			...(source_frame_rate > 30 ? { frameRate: 30 } : {})
		};

		async function convert(
			video: ConversionVideoOptions,
			trim?: { start: number; end: number },
			attempt = 0
		) {
			const target = new BufferTarget();
			const output = new Output({
				target,
				format: is_webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' })
			});
			const conversion = await Conversion.init({
				input,
				output,
				video,
				trim,
				audio: (track): ConversionAudioOptions => {
					if (trim) return { discard: true };
					const index = audio_tracks.indexOf(track);
					return copy_audio[index]
						? {}
						: { codec: audio_codec, quality: new Quality({ bitrate: audio_bitrate_per_track }) };
				}
			});
			if (
				!conversion.isValid ||
				conversion.discardedTracks.some(
					(track) =>
						track.reason !== 'discarded_by_user' &&
						(track.track.type === 'audio' || track.track.type === 'video')
				)
			) {
				const reasons = conversion.discardedTracks.map((track) => track.reason).join(', ');
				throw new Error(`Video cannot be converted without losing tracks (${reasons}).`);
			}
			if (!trim)
				conversion.onProgress = (progress) => {
					// Reserve space for possible retries; processing is complete only
					// after the size check and poster generation.
					self.postMessage({ type: 'progress', progress: 0.1 + (attempt + progress) * 0.21 });
				};
			await conversion.execute();
			if (!target.buffer) throw new Error('Transcoding produced no output.');
			return target.buffer;
		}

		if (efficient_video) {
			post_status('Repackaging video…');
			const remuxed = await convert({});
			if (remuxed.byteLength <= max_filesize) {
				await send_output(remuxed);
				return;
			}
		}

		post_status('Choosing video quality…');
		let estimated_bitrate = preferred;
		const ranges = sample_ranges(duration);
		if (ranges.length) {
			let sample_bytes = 0;
			for (const range of ranges) {
				const buffer = await convert(
					{
						...base_video,
						...build_resize_options(display_width, display_height, top),
						quality: preferred_quality
					},
					range
				);
				sample_bytes += buffer.byteLength;
			}
			// Short samples contain disproportionately many keyframes. Keeping
			// that overhead in the estimate provides useful extra headroom.
			estimated_bitrate = (sample_bytes * 8) / (ranges.length * 2);
		}
		// Complex short clips must not consume the whole file allowance merely
		// because they can. Fall back to the preferred bitrate if quality mode
		// is predicted to be unusually expensive at these dimensions.
		let use_quality = estimated_bitrate <= Math.min(budget_bitrate, preferred * 1.5);
		let size_constrained = !use_quality && budget_bitrate < preferred;
		let last_video_options: ConversionVideoOptions = {};
		let last_bitrate = 0;
		let buffer: ArrayBuffer | null = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			const encoding = choose_encoding(
				display_width,
				display_height,
				frame_rate,
				budget_bitrate,
				max_resolution,
				codec,
				size_constrained
			);
			post_status(attempt ? 'Adjusting video to fit the size limit…' : 'Optimizing video…');
			last_bitrate = encoding.bitrate;
			last_video_options = {
				...base_video,
				...build_resize_options(
					display_width,
					display_height,
					use_quality ? top : encoding.short_side
				),
				quality: use_quality ? preferred_quality : new Quality({ bitrate: encoding.bitrate })
			};
			buffer = await convert(last_video_options, undefined, attempt);
			if (buffer.byteLength <= max_filesize) break;
			budget_bitrate = retry_bitrate(
				use_quality ? budget_bitrate : encoding.bitrate,
				buffer.byteLength,
				max_filesize
			);
			use_quality = false;
			size_constrained = budget_bitrate < preferred;
			buffer = null;
		}
		if (!buffer)
			throw new Error(
				'Could not compress this video below the size limit. Please optimize it manually.'
			);
		// Only improve a result whose quality was constrained by file size.
		// Keep the resolution fixed so the measured rate remains useful, and
		// retain the valid first result if the optional retry fails or overshoots.
		if (size_constrained && !use_quality && buffer.byteLength < max_filesize * 0.85) {
			const higher_bitrate = refinement_bitrate(
				last_bitrate,
				buffer.byteLength,
				max_filesize,
				duration,
				audio_bitrate
			);
			if (higher_bitrate > last_bitrate) {
				post_status('Improving video quality within the size limit…');
				try {
					const refined = await convert(
						{
							...last_video_options,
							quality: new Quality({ bitrate: higher_bitrate })
						},
						undefined,
						3
					);
					if (refined.byteLength <= max_filesize && refined.byteLength > buffer.byteLength) {
						buffer = refined;
					}
				} catch {
					// The optional improvement must not invalidate a successful encode.
				}
			}
		}
		// A marginal saving does not justify another lossy generation.
		if (can_keep_original && buffer.byteLength >= file.size * 0.75) {
			await send_original();
			return;
		}
		await send_output(buffer);
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Video transcoding failed'
		});
	} finally {
		input.dispose();
	}
}

async function handle_poster(data: { file: File }) {
	try {
		post_status('Generating video poster…');
		const poster_buffer = await create_poster(data.file);
		self.postMessage({ type: 'poster', poster_buffer }, { transfer: [poster_buffer] });
	} catch (err) {
		self.postMessage({
			type: 'error',
			error: err instanceof Error ? err.message : 'Video poster generation failed'
		});
	}
}

self.addEventListener('message', (e) => {
	if (e.data?.type === 'process') {
		handle_process(e.data);
	} else if (e.data?.type === 'poster') {
		handle_poster(e.data);
	}
});
