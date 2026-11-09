<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['double_feature_item'] = $derived(svedit.session.get(path));
	let double_feature: Nodes['double_feature'] = $derived(svedit.session.get(path.slice(0, -1)));
	let outlined = $derived(double_feature.layout === 'outlined');
	let is_end = $derived(path.at(-1) === 'end');
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

<!-- In the outlined layout, the end feature draws the dashed line between the two: beside the start
feature, or below it on phones. The media frame has a fixed aspect ratio, so both bodies start at
the same height and the lines below the media meet. -->
<Node
	class="ew-double-feature-item min-w-0 {outlined && is_end
		? 'border-dashed border-(--stroke) max-md:border-t md:border-s'
		: ''}"
	{path}
>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class={[
			'block aspect-video overflow-hidden bg-(--muted) outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) lg:aspect-7/3',
			outlined ? 'border-b border-(--stroke)' : 'rounded-(--image-border-radius)'
		]}
	>
		<MediaProperty path={[...path, 'media']} />
	</svelte:element>
	<NodeArrayProperty
		class="ew-double-feature-body flex flex-col gap-5 sm:gap-7 {outlined
			? 'p-6 sm:p-10 lg:p-14'
			: 'pt-6 sm:pt-8'}"
		path={[...path, 'body']}
	/>
</Node>
