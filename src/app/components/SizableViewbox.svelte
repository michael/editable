<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import type { Snippet } from 'svelte';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { serialize_path } from 'svedit';

	const svedit = get_svedit_context();

	let {
		path,
		media_property = 'media',
		children,
		placeholder_aspect_ratio = 16 / 9,
		class: css_class = '',
		style: css_style = ''
	}: {
		path: DocumentPath;
		media_property?: string;
		children: Snippet;
		placeholder_aspect_ratio?: number;
		class?: string;
		style?: string;
	} = $props();

	// Derive field names from media_property: e.g. 'media' -> 'media_max_width', 'media_aspect_ratio'
	let max_width_field = $derived(`${media_property}_max_width`);
	let aspect_ratio_field = $derived(`${media_property}_aspect_ratio`);

	let node = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, media_property]));

	// The media's natural aspect ratio (or fallback)
	let natural_aspect_ratio = $derived(
		media_node?.width && media_node?.height
			? media_node.width / media_node.height
			: placeholder_aspect_ratio
	);

	// Resolve aspect ratio: 0 means use natural ratio
	let resolved_aspect_ratio = $derived(
		node[aspect_ratio_field] > 0 ? node[aspect_ratio_field] : natural_aspect_ratio
	);

	// Resolve max-width style: 0 means full width (no constraint)
	let max_width_style = $derived(node[max_width_field] > 0 ? `${node[max_width_field]}px` : '100%');

	// Anchor name for overlay handles to position against
	let anchor_name = $derived(`--viewbox-${serialize_path(path)}-${media_property}`);
</script>

<div
	class="ew-sizable-viewbox {css_class}"
	data-viewbox-anchor={anchor_name}
	style="max-width: {max_width_style}; aspect-ratio: {resolved_aspect_ratio}; anchor-name: {anchor_name}; {css_style}"
>
	{@render children()}
</div>

<style>
	.ew-sizable-viewbox {
		width: 100%;
		overflow: hidden;
	}
</style>
