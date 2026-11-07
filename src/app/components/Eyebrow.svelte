<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	let { path }: { path: DocumentPath } = $props();
</script>

<!-- The corner mark is a box with thick top and start borders, so only an L shows. It sits on the
wrapper, because the text property uses its own pseudo-elements for the placeholder. -->
<Node class="ew-eyebrow" {path}>
	<div
		class="relative inline-block bg-(--muted) px-2.5 py-1 before:pointer-events-none before:absolute before:inset-s-0 before:top-0 before:size-2 before:border-s-4 before:border-t-4 before:border-(--accent)"
		use:reveal
	>
		<TextProperty
			tag="p"
			class="body-sm text-xs font-bold text-(--accent) uppercase"
			path={[...path, 'content']}
			placeholder="Eyebrow"
		/>
	</div>
</Node>
