<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { setContext } from 'svelte';
	import { Node, NodeArrayProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();

	let prose_grid_path = $derived(path.slice(0, -2));
	let prose_grid_node: Nodes['prose_grid'] = $derived(svedit.session.get(prose_grid_path));
	let layout = $derived(prose_grid_node.layout || 'plain');
	let boxed = $derived(layout.startsWith('boxed'));
	let centered = $derived(layout.endsWith('centered-text'));

	setContext('prose', {
		get is_centered() {
			return centered;
		}
	});

	const heading_spacing = `
		[&>div:has(h1)~div>h1]:pt-8
		[&>div:has(h2)~div>h2]:pt-6
		[&>div:has(h3)~div>h3]:pt-6
		[&>span:has(.ew-eyebrow)~div>span.ew-eyebrow]:pt-6
	`;
</script>

{#snippet body()}
	<NodeArrayProperty
		class="flex flex-col gap-5 [--row:0] sm:gap-7 {heading_spacing}"
		path={[...path, 'body']}
	/>
{/snippet}

{#snippet plain()}
	<div class="py-10 sm:py-14 md:py-16 lg:py-28">
		<div class={['max-w-4xl', centered && 'text-center text-balance']}>
			{@render body()}
		</div>
	</div>
{/snippet}

{#snippet card()}
	<div
		class="ew-boxed-prose h-full bg-(--muted) px-8 py-10"
		style:border-radius="var(--image-border-radius)"
	>
		<div class={[centered && 'text-center text-balance']}>
			{@render body()}
		</div>
	</div>
{/snippet}

<Node class="ew-prose-grid-item bg-(--background) text-(--foreground)" {path}>
	{#if boxed}
		{@render card()}
	{:else}
		{@render plain()}
	{/if}
</Node>

<style>
	.ew-boxed-prose :global(.ew-button-secondary) {
		background: var(--background);
	}

	.ew-boxed-prose :global(a.ew-button-secondary:hover) {
		background: var(--muted);
	}

	.ew-boxed-prose :global(a.ew-button-secondary:active) {
		background: color-mix(in srgb, var(--foreground) 10%, transparent);
	}
</style>
