/** Codec efficiency estimates used only for planning, not visual quality measurement. */
export type OutputVideoCodec = 'avc' | 'vp8' | 'vp9' | 'av1';

const CODEC_FACTORS = { avc: 1, vp8: 1.2, vp9: 0.65, av1: 0.5 };
const RESOLUTION_LADDER = [1440, 1080, 720, 540, 360, 240, 144];
export const VIDEO_BUDGET_SAFETY = 0.9;

export function preferred_bitrate(pixels: number, frame_rate: number, codec: OutputVideoCodec) {
	return Math.round(pixels * frame_rate * 0.075 * CODEC_FACTORS[codec]);
}

/** Be conservative: bitrate alone cannot tell whether an original looks good. */
export function should_preserve_video(
	filesize: number,
	duration: number,
	pixels: number,
	frame_rate: number,
	codec: OutputVideoCodec,
	max_filesize: number
) {
	return (
		filesize <= max_filesize &&
		Number.isFinite(duration) &&
		duration > 0 &&
		(filesize * 8) / duration <= preferred_bitrate(pixels, frame_rate, codec) * 2
	);
}

/** A retry always leaves headroom and never increases the previous budget. */
export function retry_bitrate(bitrate: number, actual_size: number, max_filesize: number) {
	return Math.floor(bitrate * Math.min(0.8, (max_filesize * 0.85) / actual_size));
}

/** Estimate a higher video rate from the measured output, reserving audio separately. */
export function refinement_bitrate(
	bitrate: number,
	actual_size: number,
	max_filesize: number,
	duration: number,
	audio_bitrate: number
) {
	const actual_video_bitrate = (actual_size * 8) / duration - audio_bitrate;
	const target_video_bitrate = (max_filesize * 8 * 0.95) / duration - audio_bitrate;
	if (actual_video_bitrate <= 0 || target_video_bitrate <= actual_video_bitrate) return bitrate;
	return Math.round(bitrate * Math.min(1.5, target_video_bitrate / actual_video_bitrate));
}

export function choose_encoding(
	width: number,
	height: number,
	frame_rate: number,
	budget_bitrate: number,
	max_resolution: number,
	codec: OutputVideoCodec,
	use_full_budget = false
) {
	const top = Math.min(width, height, max_resolution);
	const aspect = Math.max(width, height) / Math.min(width, height);
	const candidates = [top, ...RESOLUTION_LADDER.filter((step) => step < top)];
	for (const short_side of candidates) {
		const pixels = short_side * Math.round(short_side * aspect);
		const preferred = preferred_bitrate(pixels, frame_rate, codec);
		if (budget_bitrate >= preferred * 0.8 || short_side === candidates.at(-1)) {
			return {
				short_side,
				// When size forces a quality reduction, don't discard budget just
				// because this resolution's usual bitrate is lower.
				bitrate: Math.floor(use_full_budget ? budget_bitrate : Math.min(budget_bitrate, preferred))
			};
		}
	}
	throw new Error('Could not choose video encoding settings.');
}

/** Several parts of the clip, rather than just a possibly static opening. */
export function sample_ranges(duration: number) {
	if (duration <= 6) return [];
	return [0.1, 0.5, 0.9].map((fraction) => {
		const start = Math.min(duration - 2, duration * fraction);
		return { start, end: start + 2 };
	});
}
