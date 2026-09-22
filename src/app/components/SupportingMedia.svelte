<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { getContext } from 'svelte';
	import { Node } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';
	import SizableViewbox from './SizableViewbox.svelte';

	const svedit = get_svedit_context();
	const prose = getContext<{ is_centered: boolean } | undefined>('prose');
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['supporting_media'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);

	// The Prose or ProseGridItem node's layout determines alignment
	let is_centered = $derived(prose?.is_centered);
</script>

{#snippet viewbox(linked = false)}
	<SizableViewbox
		{path}
		class="{is_centered ? 'mx-auto ' : ''}outline-2 outline-transparent {linked
			? 'group-focus-visible:outline-offset-2 group-focus-visible:outline-(--editing)'
			: ''}"
		style="border-radius: var(--image-border-radius)"
	>
		<MediaProperty class="supporting-media" path={[...path, 'media']} />
	</SizableViewbox>
{/snippet}

<Node {path}>
	{#if render_as_link}
		<a
			href={node.href}
			target={render_as_link && node.target !== '_self' ? node.target : undefined}
			class="group contents"
		>
			{@render viewbox(true)}
		</a>
	{:else}
		{@render viewbox()}
	{/if}
</Node>
