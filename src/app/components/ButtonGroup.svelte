<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { getContext } from 'svelte';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';

	const svedit = get_svedit_context();
	const prose = getContext<{ is_centered: boolean } | undefined>('prose');
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['button_group'] = $derived(svedit.session.get(path));
	// The Prose or ProseGridItem node's layout determines alignment
	let is_centered = $derived(prose?.is_centered);
	let gap = $derived(
		node.layout === 'tight' ? 'gap-2' : node.layout === 'loose' ? 'gap-6' : 'gap-3'
	);
</script>

<Node class="ew-button-group" {path}>
	<NodeArrayProperty
		class="flex flex-wrap items-center [--row:1] {gap}{is_centered ? ' mx-auto w-fit' : ''}"
		path={[...path, 'buttons']}
	/>
</Node>
