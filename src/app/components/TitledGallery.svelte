<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';
	import GalleryCarousel from './GalleryCarousel.svelte';

	let { path, mark: section = null } = $props();
	const svedit = get_svedit_context();
	let node: Nodes['titled_gallery'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'cards');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<Node class="ew-titled-gallery" {path}>
	<div class={layout === 'carousel' ? 'w-full' : 'mx-auto w-full max-w-7xl'}>
		<div
			class={[
				layout !== 'carousel' && 'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			{#if layout === 'carousel'}
				<GalleryCarousel path={[...path, 'items']} />
			{:else}
				<NodeArrayProperty
					class={layout === 'compact'
						? 'grid grid-cols-1 gap-x-10 gap-y-8 [--row:1] md:grid-cols-2 md:gap-y-7 lg:gap-x-14'
						: 'grid grid-cols-1 gap-x-5 gap-y-8 [--row:1] sm:gap-x-7 md:grid-cols-2 md:gap-y-7 xl:grid-cols-3'}
					path={[...path, 'items']}
				/>
			{/if}
		</div>
	</div>
</Node>
