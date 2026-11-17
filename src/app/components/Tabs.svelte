<script lang="ts">
	import { Node, NodeArrayProperty } from 'svedit';
	import type { DocumentPath, NodeArrayAttachmentContext } from 'svedit';

	let {
		path,
		mark: section = null
	}: { path: DocumentPath; mark?: NodeArrayAttachmentContext | null } = $props();
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<Node class="ew-tabs" {path}>
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				'px-5 text-(--foreground) sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<!-- A pill shell around the tabs, so its edge lines up with the content. -->
			<NodeArrayProperty
				class="flex w-fit max-w-full flex-wrap gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--muted) p-1 [--row:1]"
				path={[...path, 'items']}
			/>
		</div>
	</div>
</Node>
