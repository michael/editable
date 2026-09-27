import { expect, it } from 'vitest';
import { collect_asset_ids } from './asset_references.js';

it('collects the union of original and translated image/video assets without mutating payloads', () => {
	const payloads = [
		{
			nodes: {
				image: { type: 'image', src: 'shared.webp' },
				video: { type: 'video', src: 'original.mp4' }
			}
		},
		{
			nodes: {
				image: { type: 'image', src: 'shared.webp' },
				video: { type: 'video', src: 'translated.mp4' }
			}
		},
		{ nodes: { image: { type: 'image', src: 'translated.webp' } } }
	];
	const before = structuredClone(payloads);
	expect(collect_asset_ids(payloads)).toEqual(
		new Set(['shared.webp', 'original.mp4', 'translated.mp4', 'translated.webp'])
	);
	expect(payloads).toEqual(before);
});

it('ignores empty media, pending uploads, non-media nodes, and text-only translations', () => {
	expect(
		collect_asset_ids([
			{},
			{ nodes: {} },
			{
				nodes: {
					empty: { type: 'image', src: '' },
					pending: { type: 'video', src: 'blob:pending' },
					missing: { type: 'image' },
					number: { type: 'video', src: 42 },
					link: { type: 'link', src: 'not-media.webp' }
				}
			}
		])
	).toEqual(new Set());
});
