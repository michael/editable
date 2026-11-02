<script lang="ts">
	import { Node, TextProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['paragraph'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'regular');
</script>

<Node {path}>
	<div use:reveal>
		<TextProperty
			tag="p"
			class={`ew-body-base ${layout === 'muted' ? 'text-(--muted-foreground)' : ''}`}
			path={[...path, 'content']}
			placeholder="Paragraph"
		/>
	</div>
</Node>
