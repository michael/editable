<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { media_link_label } from '#app/media_link_label.js';
	import { Node, TextProperty } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['captioned_figure'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	let render_as_link = $derived(!svedit.editable && node.href);
	let link_label = $derived(media_link_label(media_node.alt, node.href, node.caption?.content));
	let layout = $derived(node.layout || 'caption-below');
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
			<!-- Side captions take the third column next to the media from md, aligned to its bottom edge.
			A left caption aligns to the media, so its ragged edge faces outward. -->
			<div
				class={['grid gap-3', layout !== 'caption-below' && 'md:grid-cols-3 md:items-end md:gap-7']}
			>
				<svelte:element
					this={render_as_link ? 'a' : 'div'}
					href={render_as_link ? node.href : undefined}
					target={render_as_link && node.target !== '_self' ? node.target : undefined}
					aria-label={render_as_link ? link_label : undefined}
					class={[
						'block overflow-hidden outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)',
						layout !== 'caption-below' && 'md:col-span-2'
					]}
					style:border-radius="var(--image-border-radius)"
					style:aspect-ratio={media_node.width && media_node.height
						? `${media_node.width} / ${media_node.height}`
						: '2 / 1'}
				>
					<MediaProperty path={[...path, 'media']} />
				</svelte:element>
				<TextProperty
					tag="figcaption"
					class="text-sm leading-6 text-(--muted-foreground) sm:text-base {layout === 'caption-left'
						? 'md:order-first md:text-end'
						: ''}"
					path={[...path, 'caption']}
					placeholder="Caption"
				/>
			</div>
		</div>
	</div>
</Node>
