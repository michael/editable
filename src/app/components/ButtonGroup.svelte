<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { getContext } from 'svelte';
	import { Node, NodeArrayProperty } from 'svedit';

	const prose = getContext<{ is_centered: boolean } | undefined>('prose');
	let { path }: { path: DocumentPath } = $props();
	// The Prose or ProseGridItem node's layout determines alignment
	let is_centered = $derived(prose?.is_centered);
</script>

<Node class="ew-button-group" {path}>
	<NodeArrayProperty
		class="button-group-buttons flex flex-wrap items-center [--row:1] gap-3{is_centered
			? ' mx-auto w-fit'
			: ''}"
		path={[...path, 'buttons']}
	/>
</Node>
