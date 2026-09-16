<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['code'] = $derived(svedit.session.get(path));
</script>

<code
	id={node.id}
	data-node-id={node.id}
	class="rounded border border-(--stroke) bg-(--muted) px-1 box-decoration-clone font-mono text-[0.9em] leading-4 font-normal wrap-anywhere subpixel-antialiased"
	>{content}</code
>
