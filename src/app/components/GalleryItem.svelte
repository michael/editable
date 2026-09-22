<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['gallery_item'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

<Node class="gallery-item" {path}>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="image-wrapper block overflow-hidden outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
		style:border-radius="var(--image-border-radius)"
		use:reveal
	>
		<MediaProperty class="image-property" path={[...path, 'media']} />
	</svelte:element>
</Node>
