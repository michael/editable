<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { NodeArrayProperty, Node } from 'svedit';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['footer'] = $derived(svedit.session.get(path));
	let column_count = $derived(node.footer_link_columns.nodes.length);
	let grid_cols_class = $derived(
		column_count <= 1
			? 'lg:grid-cols-1'
			: column_count === 2
				? 'sm:grid-cols-2'
				: column_count === 3
					? 'sm:grid-cols-2 lg:grid-cols-3'
					: 'sm:grid-cols-2 lg:grid-cols-4'
	);
</script>

<Node {path} class="text-sm text-(--foreground)">
	<div class="mx-auto max-w-7xl">
		<div
			class="flex flex-col items-stretch gap-x-10 gap-y-10 px-5 pt-48 pb-10 sm:gap-y-14 sm:px-7 sm:pt-32 lg:flex-row lg:py-32"
		>
			<NodeArrayProperty
				class="flex flex-col gap-5 [--row:0] sm:gap-7 lg:w-1/3"
				path={[...path, 'body']}
			/>
			<NodeArrayProperty
				class="grid grid-cols-1 [--row:1] {grid_cols_class} flex-1 gap-x-8 gap-y-10 lg:gap-x-10 lg:gap-y-12"
				path={[...path, 'footer_link_columns']}
			/>
		</div>
	</div>
</Node>
