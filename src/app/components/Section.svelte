<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';

	const svedit = get_svedit_context();
	let { path, children }: { path: DocumentPath; children?: Snippet } = $props();
	let node: Nodes['section'] = $derived(svedit.session.get(path));
	let accent = $derived(node.layout === 'accent');

	const bracket_class =
		'pointer-events-none absolute left-1 right-1 z-1 h-2 select-none sm:left-2 sm:right-2 sm:h-4';
	const corner_class = 'absolute size-2 border-(--stroke) sm:size-3.5';
</script>

<!-- An accent section keeps its colors in --ew-box*, so the content can remap every token to them,
including the editing colors. Blocks inside then render on the accent without changes of their own. -->
<section
	class={accent &&
		'bg-(--accent) text-(--accent-foreground) [--ew-box-foreground:var(--accent-foreground)] [--ew-box:var(--accent)]'}
>
	<div
		class={accent &&
			'ew-native-selection [--accent-foreground:var(--ew-box)] [--accent:var(--ew-box-foreground)] [--background:var(--ew-box)] [--editing-foreground:var(--ew-box)] [--editing-muted:color-mix(in_srgb,var(--ew-box-foreground)_25%,transparent)] [--editing:var(--ew-box-foreground)] [--foreground:var(--ew-box-foreground)] [--muted-foreground:color-mix(in_srgb,var(--ew-box-foreground)_75%,var(--ew-box))] [--muted:color-mix(in_srgb,var(--ew-box-foreground)_12%,var(--ew-box))] [--stroke:color-mix(in_srgb,var(--ew-box-foreground)_35%,var(--ew-box))]'}
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
	</div>
</section>
