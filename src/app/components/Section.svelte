<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';

	const svedit = get_svedit_context();
	let { path, children }: { path: DocumentPath; children?: Snippet } = $props();
	let node: Nodes['section'] = $derived(svedit.session.get(path));
	let colorset = $derived(node.colorset || 'colorset-1');

	const bracket_class =
		'pointer-events-none absolute left-1 right-1 z-1 h-2 select-none sm:left-2 sm:right-2 sm:h-4';
	const corner_class = 'absolute size-2 border-(--stroke) sm:size-3.5';
</script>

<!-- Color set 1 keeps the surrounding colors. Sets 2 and 3 draw their background, and blocks inside pick up their tokens. -->
<section
	class={colorset !== 'colorset-1' && `ew-${colorset} bg-(--background) text-(--foreground)`}
>
	{#if svedit.editable}
		<div class="relative">
			<div class="{bracket_class} top-1.5 sm:top-4" contenteditable="false" aria-hidden="true">
				<div class="{corner_class} top-0 left-0 border-t border-l"></div>
				<div class="{corner_class} top-0 right-0 border-t border-r"></div>
			</div>
		</div>
	{/if}
	{#if children}
		{@render children()}
	{/if}
	{#if svedit.editable}
		<div class="relative">
			<div
				class="{bracket_class} bottom-1.5 sm:bottom-4"
				contenteditable="false"
				aria-hidden="true"
			>
				<div class="{corner_class} bottom-0 left-0 border-b border-l"></div>
				<div class="{corner_class} right-0 bottom-0 border-r border-b"></div>
			</div>
		</div>
	{/if}
</section>
