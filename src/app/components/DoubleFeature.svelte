<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node } from 'svedit';
	import DoubleFeatureItem from './DoubleFeatureItem.svelte';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['double_feature'] = $derived(svedit.session.get(path));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<Node class="ew-double-feature bg-(--background) text-(--foreground)" {path}>
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div
				class={[
					'grid grid-cols-1 md:grid-cols-2',
					node.layout === 'outlined'
						? 'border border-(--stroke) bg-(--background)'
						: 'gap-x-5 gap-y-16 sm:gap-x-7'
				]}
				use:reveal
			>
				<DoubleFeatureItem path={[...path, 'start']} />
				<DoubleFeatureItem path={[...path, 'end']} />
			</div>
		</div>
	</div>
</Node>
