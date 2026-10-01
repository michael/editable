<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { Node, NodeArrayProperty } from 'svedit';

	let { path }: { path: DocumentPath } = $props();
</script>

<Node {path}>
	<div class="flex w-full flex-col py-2" role="list">
		<NodeArrayProperty class="flex flex-col gap-2" path={[...path, 'list_items']} />
	</div>
</Node>
