<script lang="ts">
	import { ASSET_BASE, VARIANT_WIDTHS } from '#app/config.js';
	import { site_href } from '#app/site_links.js';

	import type { PreviewMediaNode } from '#app/page_metadata.js';

	let { node }: { node: PreviewMediaNode } = $props();

	// Determine if src is a blob URL (unsaved), a saved asset id, or empty
	let is_blob = $derived(node.src?.startsWith('blob:'));
	let is_saved = $derived(node.src && !is_blob);
	let assets = $derived(site_href(ASSET_BASE));

	// Resolve the display URL
	let display_src = $derived(is_blob ? node.src : is_saved ? `${assets}/${node.src}` : '');

	// Use mime_type with fallback to file extension for legacy data
	let is_svg = $derived(
		node.mime_type ? node.mime_type === 'image/svg+xml' : node.src?.endsWith('.svg')
	);
	let is_gif = $derived(
		node.mime_type ? node.mime_type === 'image/gif' : node.src?.endsWith('.gif')
	);

	// Build srcset for saved raster images (not SVGs, not GIFs, not blobs)
	let srcset = $derived(build_srcset());

	function build_srcset() {
		if (!is_saved || is_svg || is_gif) return '';

		const ext_index = node.src.lastIndexOf('.');
		if (ext_index === -1) return '';

		const asset_stem = node.src.slice(0, ext_index);
		const applicable = VARIANT_WIDTHS.filter((w) => w < node.width);

		if (applicable.length === 0) return '';

		const variant_entries = applicable.map((w) => `${assets}/${asset_stem}/w${w}.webp ${w}w`);
		// The original is the largest entry
		variant_entries.push(`${assets}/${node.src} ${node.width}w`);

		return variant_entries.join(', ');
	}

	// Apply scale to image
	let image_style = $derived(`
		object-position: ${node.focal_point_x * 100}% ${node.focal_point_y * 100}%;
		transform: scale(${node.scale});
		transform-origin: ${node.focal_point_x * 100}% ${node.focal_point_y * 100}%;
		object-fit: ${node.object_fit};
	`);
</script>

{#if display_src}
	<img
		contenteditable="false"
		src={display_src}
		srcset={srcset || undefined}
		sizes={srcset ? 'auto' : undefined}
		loading="lazy"
		alt={node.alt}
		width={node.width}
		height={node.height}
		style={image_style}
	/>
{/if}

<style>
	img {
		width: 100%;
		height: 100%;
		transform-origin: center center;
	}
</style>
