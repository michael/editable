<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['captioned_figure'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	let render_as_link = $derived(!svedit.editable && node.href);
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<Node {path}>
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				`captioned-figure px-5 sm:px-7`,
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<svelte:element
				this={render_as_link ? 'a' : 'div'}
				href={render_as_link ? node.href : undefined}
				target={render_as_link ? node.target : undefined}
				class="block overflow-hidden outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
				style:border-radius="var(--image-border-radius)"
				style:aspect-ratio={media_node.width && media_node.height
					? `${media_node.width} / ${media_node.height}`
					: '2 / 1'}
			>
				<MediaProperty path={[...path, 'media']} />
			</svelte:element>
			<TextProperty
				tag="figcaption"
				class="mt-4 text-sm leading-6 sm:text-base"
				path={[...path, 'caption']}
				placeholder="Caption"
			/>
		</div>
	</div>
</Node>
