<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['paragraph_sm'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'regular');
</script>

<Node class="ew-paragraph-sm" {path}>
	<div use:reveal>
		<TextProperty
			tag="p"
			class={`body-sm ${layout === 'muted' ? 'text-(--muted-foreground)' : ''}`}
			path={[...path, 'content']}
			placeholder="Small Paragraph"
		/>
	</div>
</Node>
