<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';
	import MediaProperty from './MediaProperty.svelte';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['feature'] = $derived(svedit.session.get(path));
	let media_node = $derived(svedit.session.get([...path, 'media']));
	let render_as_link = $derived(!svedit.editable && node.href);
	let media_aspect_ratio = $derived(
		media_node.width && media_node.height ? `${media_node.width} / ${media_node.height}` : undefined
	);
	let feature_layout = $derived(node.layout?.endsWith('image-left') ? 'image-left' : 'image-right');
	let outlined = $derived(node.layout?.startsWith('outlined-'));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

<!-- Primitives -->
{#snippet image(placeholder_aspect_ratio = '3 / 4', border_radius = false)}
	<div class="flex h-full w-full items-center">
		<svelte:element
			this={render_as_link ? 'a' : 'div'}
			href={render_as_link ? node.href : undefined}
			target={render_as_link && node.target !== '_self' ? node.target : undefined}
			class="block w-full overflow-hidden outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
			style:border-radius={border_radius ? 'var(--image-border-radius)' : undefined}
			style:aspect-ratio={media_aspect_ratio ?? placeholder_aspect_ratio}
		>
			<MediaProperty path={[...path, 'media']} />
		</svelte:element>
	</div>
{/snippet}

{#snippet body()}
	<NodeArrayProperty
		class="ew-feature-body flex flex-col gap-5 sm:gap-7"
		path={[...path, 'body']}
	/>
{/snippet}

<!-- The columns use the card grid's gap, so the image lines up with two-column galleries. The text
side pads out the rest of the wider gap that text columns get. -->
{#snippet image_right()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				`grid grid-cols-1 gap-x-5 gap-y-10 px-5 sm:gap-x-7 sm:px-7 md:grid-cols-2`,
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="flex flex-col justify-center pb-0 md:pe-3 lg:pe-7" use:reveal>
				<div class="max-w-2xl">{@render body()}</div>
			</div>
			<div use:reveal={{ delay: 200 }}>
				{@render image('3 / 4', true)}
			</div>
		</div>
	</div>
{/snippet}

{#snippet image_left()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				`grid grid-cols-1 gap-x-5 gap-y-10 px-5 sm:gap-x-7 sm:px-7 md:grid-cols-2`,
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="max-md:order-2" use:reveal={{ delay: 200 }}>
				{@render image('3 / 4', true)}
			</div>
			<div class="flex flex-col justify-center pb-0 max-md:order-1 md:ps-3 lg:ps-7" use:reveal>
				<div class="max-w-2xl">{@render body()}</div>
			</div>
		</div>
	</div>
{/snippet}

{#snippet outlined_layout()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<!-- The media half fills with the muted color, and its border divides the halves. Text comes
			first on phones. -->
			<div
				class="grid grid-cols-1 overflow-hidden rounded-(--image-border-radius) border border-(--stroke) md:grid-cols-2"
				use:reveal
			>
				<div class="flex flex-col justify-center p-6 sm:p-10 lg:p-14">{@render body()}</div>
				<div
					class={[
						'border-t border-(--stroke) bg-(--muted) p-6 sm:p-8 md:border-t-0',
						feature_layout === 'image-left' ? 'md:order-first md:border-e' : 'md:border-s'
					]}
				>
					{@render image('3 / 4', true)}
				</div>
			</div>
		</div>
	</div>
{/snippet}

<Node class="ew-feature bg-(--background) text-(--foreground)" {path}>
	{#if outlined}
		{@render outlined_layout()}
	{:else if feature_layout === 'image-left'}
		{@render image_left()}
	{:else}
		{@render image_right()}
	{/if}
</Node>
