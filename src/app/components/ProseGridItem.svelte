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
	let accent = $derived(layout.startsWith('boxed-accent'));
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
	<div class="pt-block-generous pb-block-generous">
		<div class={['max-w-4xl', centered && 'text-center text-balance']}>
			{@render body()}
		</div>
	</div>
{/snippet}

{#snippet card()}
	<!-- The accent box keeps its colors in --ew-box*, so the content can remap every token to them,
	including the editing colors. -->
	<div
		class={[
			'ew-boxed-prose h-full px-6 py-8 sm:px-8 sm:py-10',
			accent
				? 'bg-(--accent) text-(--accent-foreground) [--ew-box-foreground:var(--accent-foreground)] [--ew-box:var(--accent)]'
				: 'bg-(--muted)'
		]}
		style:border-radius="var(--image-border-radius)"
	>
		<div
			class={[
				centered && 'text-center text-balance',
				accent &&
					'ew-native-selection [--accent-foreground:var(--ew-box)] [--accent:var(--ew-box-foreground)] [--background:var(--ew-box)] [--editing-foreground:var(--ew-box)] [--editing-muted:color-mix(in_srgb,var(--ew-box-foreground)_25%,transparent)] [--editing:var(--ew-box-foreground)] [--foreground:var(--ew-box-foreground)] [--muted-foreground:color-mix(in_srgb,var(--ew-box-foreground)_75%,var(--ew-box))] [--muted:color-mix(in_srgb,var(--ew-box-foreground)_12%,var(--ew-box))] [--stroke:color-mix(in_srgb,var(--ew-box-foreground)_35%,var(--ew-box))]'
			]}
		>
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
