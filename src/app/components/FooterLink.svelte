<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { TextProperty, Node } from 'svedit';
	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['footer_link'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

<Node {path}>
	<div class="block">
		<svelte:element
			this={render_as_link ? 'a' : 'div'}
			href={render_as_link ? node.href : undefined}
			target={render_as_link && node.target !== '_self' ? node.target : undefined}
			class="inline-block decoration-transparent underline-offset-2 outline-2 outline-transparent hover:text-(--foreground) hover:underline hover:decoration-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
			class:hover:underline={render_as_link}
		>
			<TextProperty class="inline" path={[...path, 'label']} placeholder="Link" />
		</svelte:element>
	</div>
</Node>
