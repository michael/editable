<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	let { path }: { path: DocumentPath } = $props();
</script>

<Node class="ew-eyebrow" {path}>
	<div class="inline-block bg-(--muted) px-2.5 py-1" use:reveal>
		<TextProperty
			tag="p"
			class="body-sm text-xs font-bold text-(--accent) uppercase"
			path={[...path, 'content']}
			placeholder="Eyebrow"
		/>
	</div>
</Node>
