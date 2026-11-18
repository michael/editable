<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { media_link_label } from '#app/media_link_label.js';
	import { Node } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['media_button'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	// Media keeps its own aspect ratio at the button height: regular 44px, small 36px, tiny 24px.
	let aspect_ratio = $derived(
		media_node.width > 0 && media_node.height > 0 ? media_node.width / media_node.height : 1
	);
	let height = $derived(node.layout === 'tiny' ? 6 : node.layout === 'small' ? 9 : 11);
	let render_as_link = $derived(!svedit.editable && node.href);
	let link_label = $derived(media_link_label(media_node.alt, node.href));
</script>

<Node class="ew-media-button shrink-0" {path}>
	<!-- Definite dimensions keep intrinsic image sizes from affecting the button group. -->
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		aria-label={render_as_link ? link_label : undefined}
		class="block overflow-hidden rounded-(--image-border-radius) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) {render_as_link
			? 'transition-opacity hover:opacity-80 active:opacity-70'
			: ''}"
		style:height={`calc(var(--spacing) * ${height})`}
		style:width={`calc(var(--spacing) * ${height} * ${aspect_ratio})`}
	>
		<MediaProperty path={[...path, 'media']} />
	</svelte:element>
</Node>
