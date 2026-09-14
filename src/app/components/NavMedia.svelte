<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['nav_media'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	let media_aspect_ratio = $derived(
		media_node.width > 0 && media_node.height > 0 ? media_node.width / media_node.height : 1
	);
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

<Node class="nav-media flex min-w-9 shrink-0 items-center" {path}>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		class="inline-flex min-h-9 shrink-0 grow items-center justify-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
	>
		<!-- Definite dimensions avoid intrinsic image sizing affecting the flex wrapper's width. -->
		<div class="h-8 shrink-0" style:width={`calc(var(--spacing) * 8 * ${media_aspect_ratio})`}>
			<MediaProperty path={[...path, 'media']} />
		</div>
	</svelte:element>
</Node>
