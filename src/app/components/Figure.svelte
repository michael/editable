<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['figure'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	let render_as_link = $derived(!svedit.editable && node.href);
	let figure_layout = $derived(node.layout || 'wide');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let media_aspect_ratio = $derived(
		media_node?.width && media_node?.height ? `${media_node.width} / ${media_node.height}` : '2/1'
	);
</script>

{#snippet media_frame(border_radius = true)}
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link ? node.target : undefined}
		class="block overflow-hidden outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
		style:border-radius={border_radius ? 'var(--image-border-radius)' : undefined}
		style:aspect-ratio={media_aspect_ratio}
	>
		<MediaProperty path={[...path, 'media']} />
	</svelte:element>
{/snippet}

{#snippet wide()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				`figure px-5 sm:px-7`,
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			{@render media_frame()}
		</div>
	</div>
{/snippet}

{#snippet narrow_left()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'figure',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="max-w-4xl px-5 sm:px-7">
				{@render media_frame()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_center()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'figure',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="mx-auto max-w-4xl px-5 sm:px-7">
				{@render media_frame()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_right()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'figure',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="ml-auto max-w-4xl px-5 sm:px-7">
				{@render media_frame()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet flush()}
	<div class="mx-auto max-w-7xl">
		<div class="figure px-5 py-0 sm:px-7">
			{@render media_frame()}
		</div>
	</div>
{/snippet}

{#snippet full_bleed()}
	<div class="w-full">
		<div class="figure">
			{@render media_frame(false)}
		</div>
	</div>
{/snippet}

<Node {path}>
	{@const layouts = {
		wide,
		'narrow-left': narrow_left,
		'narrow-center': narrow_center,
		'narrow-right': narrow_right,
		flush,
		'full-bleed': full_bleed
	}}
	{@render layouts[figure_layout]()}
</Node>
