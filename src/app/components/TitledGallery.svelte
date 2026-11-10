<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';
	import GalleryCarousel from './GalleryCarousel.svelte';

	let { path, mark: section = null } = $props();
	const svedit = get_svedit_context();
	let node: Nodes['titled_gallery'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'cards');
	let is_carousel = $derived(['carousel', 'carousel-2-columns'].includes(layout));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<Node class="ew-titled-gallery" {path}>
	<div class={is_carousel ? 'w-full' : 'mx-auto w-full max-w-7xl'}>
		<div
			class={[
				!is_carousel && 'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			{#if is_carousel}
				<GalleryCarousel
					path={[...path, 'items']}
					columns={layout === 'carousel-2-columns' ? 2 : 3}
				/>
			{:else}
				<NodeArrayProperty
					class={layout === 'compact'
						? 'grid grid-cols-1 gap-x-10 gap-y-8 [--row:1] md:grid-cols-2 md:gap-y-7 lg:gap-x-14'
						: layout.startsWith('outlined')
							? `grid grid-cols-1 gap-5 [--row:1] sm:gap-7 md:grid-cols-2 ${layout === 'outlined-2-columns' ? '' : 'xl:grid-cols-3'}`
							: `grid grid-cols-1 gap-x-5 gap-y-10 [--row:1] sm:gap-x-7 md:grid-cols-2 md:gap-y-20 ${layout === 'cards-2-columns' ? '' : 'xl:grid-cols-3'}`}
					path={[...path, 'items']}
				/>
			{/if}
		</div>
	</div>
</Node>
