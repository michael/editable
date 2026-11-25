<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['nav_button'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
	let layout = $derived(node.layout || 'primary');
</script>

<!-- Two layers, as in Button: the outer element is the click and hover target and never moves, and
the inner face draws the button, ignoring the pointer while viewing. -->
{#snippet face(fill: string, hover: string)}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="group/button inline-flex max-w-full rounded-(--button-border-radius) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {render_as_link
			? 'cursor-pointer'
			: ''}"
	>
		<span
			class="ew-button inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border px-4 py-1.5 text-center text-sm leading-5 font-normal wrap-anywhere {fill} {render_as_link
				? `pointer-events-none transition-colors ${hover}`
				: ''}"
		>
			<TextProperty path={[...path, 'label']} placeholder="Button" />
		</span>
	</svelte:element>
{/snippet}

<Node class="flex items-center" {path}>
	{#if layout === 'primary-accent'}
		{@render face(
			'ew-native-selection border-transparent bg-(--accent) text-(--accent-foreground)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] group-active/button:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]'
		)}
	{:else if layout === 'secondary'}
		{@render face(
			'border-(--stroke) bg-(--muted) text-(--foreground)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_5%)] group-active/button:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_10%)]'
		)}
	{:else}
		{@render face(
			'ew-native-selection border-transparent bg-(--foreground) text-(--background)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--foreground),var(--background)_20%)] group-active/button:bg-[color-mix(in_srgb,var(--foreground),var(--background)_30%)]'
		)}
	{/if}
</Node>
