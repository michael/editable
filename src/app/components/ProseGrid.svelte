<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['prose_grid'] = $derived(svedit.session.get(path));
	let item_count = $derived(node.items?.nodes.length || 0);
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let grid_cols_class = $derived(
		item_count <= 1 ? 'lg:grid-cols-1' : item_count === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
	);
	// Plain items have only whitespace between them, so they get twice the gaps. Boxed and outlined
	// items keep the card gaps, so their edges line up with galleries.
	let gap_class = $derived(
		node.layout?.startsWith('boxed') || node.layout?.startsWith('outlined')
			? 'gap-x-5 gap-y-8 sm:gap-x-7 lg:gap-y-7'
			: 'gap-x-14 gap-y-24 lg:gap-y-32'
	);
</script>

<Node {path}>
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<NodeArrayProperty
				class="grid grid-cols-1 {grid_cols_class} {gap_class} [--row:1]"
				path={[...path, 'items']}
			/>
		</div>
	</div>
</Node>
