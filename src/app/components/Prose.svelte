<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import type { Nodes } from '#app/document_schema.js';
	import { setContext } from 'svelte';
	import { Node, NodeArrayProperty } from 'svedit';
	import type { DocumentPath, NodeArrayAttachmentContext } from 'svedit';

	const svedit = get_svedit_context();
	let {
		path,
		mark: section = null
	}: { path: DocumentPath; mark?: NodeArrayAttachmentContext | null } = $props();
	let node: Nodes['prose'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'narrow-left');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);

	setContext('prose', {
		get is_centered() {
			return layout === 'narrow-centered-text' || layout === 'wide-centered-text';
		}
	});
</script>

{#snippet body()}
	<NodeArrayProperty class="flex flex-col gap-5 sm:gap-7" path={[...path, 'body']} />
{/snippet}

{#snippet narrow_left()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="max-w-4xl px-5 sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_center()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="mx-auto max-w-4xl px-5 sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_right()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="ml-auto max-w-4xl px-5 sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_centered_text()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="mx-auto max-w-4xl px-5 text-center text-balance sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet wide_left()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="px-5 sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet wide_centered_text()}
	<div class="mx-auto max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="px-5 text-center text-balance sm:px-7">
				{@render body()}
			</div>
		</div>
	</div>
{/snippet}

<Node class="ew-prose layout-{layout} bg-(--background) text-(--foreground)" {path}>
	{@const layouts = {
		'narrow-left': narrow_left,
		'narrow-center': narrow_center,
		'narrow-right': narrow_right,
		'narrow-centered-text': narrow_centered_text,
		'wide-left': wide_left,
		'wide-centered-text': wide_centered_text
	}}
	{@render layouts[layout]()}
</Node>
