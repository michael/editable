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
			? 'min-h-9 min-w-9 px-4 py-1.5 text-sm leading-5'
			: 'min-h-11 min-w-11 px-5 py-2 text-base leading-6'
	);
	let link_size = $derived(
		is_small
			? 'min-h-9 min-w-6 py-2 text-sm leading-5'
			: 'min-h-11 min-w-6 py-2.5 text-base leading-6 pointer-coarse:min-w-11'
	);
</script>

<!-- Filled buttons have two layers. The outer element is the click and hover target and never moves;
the inner face draws the button. While viewing, the face ignores the pointer and takes its hover
styles from the outer element with group-hover/button:, so effects that move or resize it, such as
a lift on hover, can't end the hover that started them. -->
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
			class="ew-button inline-flex max-w-full items-center justify-center rounded-(--button-border-radius) border text-center font-normal wrap-anywhere {fill} {button_size} {render_as_link
				? `pointer-events-none transition-colors ${hover}`
				: ''}"
		>
			<TextProperty path={[...path, 'label']} placeholder="Button" />
		</span>
	</svelte:element>
{/snippet}

{#snippet link()}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="ew-button inline-flex max-w-full items-center justify-start text-start font-normal wrap-anywhere text-(--foreground) underline decoration-[color-mix(in_oklab,currentColor_30%,transparent)] decoration-1 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {link_size} {render_as_link
			? 'transition-colors hover:decoration-current active:decoration-current'
			: ''}"
	>
		<TextProperty path={[...path, 'label']} placeholder="Button" />
	</svelte:element>
{/snippet}

<Node {path}>
	{#if button_variant === 'primary-accent'}
		{@render face(
			'ew-native-selection border-transparent bg-(--accent) text-(--accent-foreground)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] group-active/button:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]'
		)}
	{:else if button_variant === 'secondary'}
		{@render face(
			'border-(--stroke) bg-(--muted) text-(--foreground)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_5%)] group-active/button:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_10%)]'
		)}
	{:else if button_variant === 'link'}
		{@render link()}
	{:else}
		{@render face(
			'ew-native-selection border-transparent bg-(--foreground) text-(--background)',
			'group-hover/button:bg-[color-mix(in_srgb,var(--foreground),var(--background)_20%)] group-active/button:bg-[color-mix(in_srgb,var(--foreground),var(--background)_30%)]'
		)}
	{/if}
</Node>
