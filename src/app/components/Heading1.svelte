<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['heading_1'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'regular');
</script>

<Node class="ew-heading-1" {path}>
	<div use:reveal>
		<TextProperty
			tag="h1"
			class={`ew-display-2 ${layout === 'muted' ? 'text-(--muted-foreground)' : ''}`}
			path={[...path, 'content']}
			placeholder="Heading 1"
		/>
	</div>
</Node>
