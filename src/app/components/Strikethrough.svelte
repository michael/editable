<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['strikethrough'] = $derived(svedit.session.get(path));
</script>

<s id={node.id} data-node-id={node.id} class="line-through decoration-[0.0625em]">{content}</s>
