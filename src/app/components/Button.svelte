<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['button'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
	let layout = $derived(node.layout || 'primary');
	let button_variant = $derived(layout.replace('-small', ''));
	let is_small = $derived(layout.endsWith('-small'));
	let button_size = $derived(
		is_small
			? 'min-h-9 min-w-9 px-3 py-1.5 text-sm leading-5'
			: 'min-h-11 min-w-11 px-5 py-2 text-base leading-6'
	);
	let link_size = $derived(
		is_small
			? 'min-h-9 min-w-6 py-2 text-sm leading-5'
			: 'min-h-11 min-w-6 py-2.5 text-base leading-6 pointer-coarse:min-w-11'
	);
</script>

{#snippet primary()}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="ew-button inline-flex max-w-full items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) text-center font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {button_size} {render_as_link
			? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]'
			: ''}"
	>
		<TextProperty path={[...path, 'label']} placeholder="Button" />
	</svelte:element>
{/snippet}

{#snippet secondary()}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="ew-button ew-button-secondary inline-flex max-w-full items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent text-center font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {button_size} {render_as_link
			? 'cursor-pointer hover:bg-(--muted) active:bg-(--foreground)/10'
			: ''}"
	>
		<TextProperty path={[...path, 'label']} placeholder="Button" />
	</svelte:element>
{/snippet}

{#snippet link()}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="ew-button inline-flex max-w-full items-center justify-start text-start font-normal wrap-anywhere text-(--foreground) underline decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {link_size} {render_as_link
			? 'hover:decoration-2 active:decoration-2'
			: ''}"
	>
		<TextProperty path={[...path, 'label']} placeholder="Button" />
	</svelte:element>
{/snippet}

<Node {path}>
	{#if button_variant === 'secondary'}
		{@render secondary()}
	{:else if button_variant === 'link'}
		{@render link()}
	{:else}
		{@render primary()}
	{/if}
</Node>
