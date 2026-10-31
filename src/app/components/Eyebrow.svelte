<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['eyebrow'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'regular');
</script>

<!-- Corner marks are a border masked down to its corners. They sit on the wrapper, because the
text property uses its own pseudo-elements for the placeholder. -->
<Node class="ew-eyebrow" {path}>
	<div
		class="relative inline-block bg-(--muted) px-3 py-1 before:pointer-events-none before:absolute before:inset-0 before:border before:border-(--accent) before:[mask:conic-gradient(at_5px_5px,#0000_75%,#000_0)_0_0/calc(100%-5px)_calc(100%-5px)]"
		use:reveal
	>
		<TextProperty
			tag="p"
			class={`body-sm ${layout === 'muted' ? 'text-(--muted-foreground)' : ''}`}
			path={[...path, 'content']}
			placeholder="Eyebrow"
		/>
	</div>
</Node>
