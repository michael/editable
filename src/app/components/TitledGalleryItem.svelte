<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';
	import Card from './Card.svelte';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['titled_gallery_item'] = $derived(svedit.session.get(path));
	let gallery = $derived(svedit.session.get(path.slice(0, -2)));
	let layout = $derived(gallery?.layout || 'cards');
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

{#snippet compact()}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link ? node.target : undefined}
		class="group/gallery-link flex items-center gap-5 outline-1 outline-transparent focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-(--editing) sm:gap-7"
		use:reveal
	>
		<div
			class="aspect-square w-20 shrink-0 overflow-hidden sm:w-24 md:w-20 xl:w-24"
			style:border-radius="var(--image-border-radius)"
		>
			<MediaProperty path={[...path, 'media']} />
		</div>
		<div class="min-w-0">
			<TextProperty
				class="body-base {node.href
					? 'underline decoration-[0.0625em] underline-offset-[0.125em]'
					: ''} {render_as_link
					? 'group-hover/gallery-link:decoration-[0.125em] group-active/gallery-link:decoration-[0.125em]'
					: ''}"
				path={[...path, 'title']}
				placeholder="Title"
			/>
		</div>
	</svelte:element>
{/snippet}

<Node
	class="ew-titled-gallery-item group min-w-0 {layout === 'carousel' ? 'snap-start' : ''}"
	{path}
>
	{#if layout === 'compact'}
		{@render compact()}
	{:else}
		<Card href={node.href} target={node.target} editable={svedit.editable}>
			{#snippet media()}
				<MediaProperty path={[...path, 'media']} />
			{/snippet}
			{#snippet title()}
				<TextProperty path={[...path, 'title']} placeholder="Title" />
			{/snippet}
		</Card>
	{/if}
</Node>
