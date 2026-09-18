<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';
	let { path, mark: section = null } = $props();

	const svedit = get_svedit_context();
	let node: Nodes['gallery'] = $derived(svedit.session.get(path));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let grid_layout = $derived.by(get_grid_layout);

	function get_grid_layout() {
		const layouts = {
			mixed: `
	    	[--row:1]
				grid grid-cols-6

				*:col-span-6 *:**:[.image-wrapper]:aspect-[2/1]
				[&>:nth-child(6n+2_of_[data-type=node])]:col-span-3 [&>:nth-child(6n+2_of_[data-type=node])]:**:[.image-wrapper]:aspect-square [&>:nth-child(6n+3_of_[data-type=node])]:col-span-3
				[&>:nth-child(6n+3_of_[data-type=node])]:**:[.image-wrapper]:aspect-square [&>:nth-child(6n+4_of_[data-type=node])]:col-span-2 [&>:nth-child(6n+4_of_[data-type=node])]:**:[.image-wrapper]:aspect-[4/6] [&>:nth-child(6n+5_of_[data-type=node])]:col-span-2 [&>:nth-child(6n+5_of_[data-type=node])]:**:[.image-wrapper]:aspect-[4/6] [&>:nth-child(6n+6_of_[data-type=node])]:col-span-2 [&>:nth-child(6n+6_of_[data-type=node])]:**:[.image-wrapper]:aspect-[4/6]
   		`,
			portraits: `
	     	[--row:1]
				grid grid-cols-3
				**:[.image-wrapper]:aspect-[3/4]
   		`,
			'squares-2-columns': `
				[--row:1]
				grid grid-cols-1 md:grid-cols-2
				**:[.image-wrapper]:aspect-square
			`,
			'squares-3-columns': `
				[--row:1]
				grid grid-cols-2 md:grid-cols-3
				**:[.image-wrapper]:aspect-square
			`,
			squares: `
	     	[--row:1]
				grid grid-cols-2 md:grid-cols-4
				**:[.image-wrapper]:aspect-square
   		`,
			landscapes: `
	     	[--row:1]
				grid grid-cols-1 md:grid-cols-2
				**:[.image-wrapper]:aspect-[4/3]
   		`,
			'compact-landscapes': `
	     	[--row:1]
				grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6
				**:[.image-wrapper]:aspect-[2/1]
   		`
		};

		return layouts[node.layout ?? 'mixed'];
	}
</script>

<Node {path}>
	<div class="bg-(--background) text-(--foreground)">
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					'px-5 sm:px-7',
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<NodeArrayProperty
					class="flex flex-col gap-5 sm:gap-7 {grid_layout}"
					path={[...path, 'gallery_items']}
				/>
			</div>
		</div>
	</div>
</Node>
