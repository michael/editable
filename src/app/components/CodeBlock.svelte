<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { lazy_highlight_editable_code as highlight_editable_code } from '#lib/lazy_highlight_editable_code.js';
	import { highlight_code } from '#lib/code_highlighting.js';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['code_block'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'narrow-left');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let highlighted_segments = $derived(
		!svedit.editable ? await highlight_code(node.content?.content ?? '', node.language) : null
	);
</script>

{#snippet code()}
	<!-- The anchor places the language picker in Overlays. -->
	<div
		class="border border-(--stroke) bg-(--muted) p-3 font-mono text-sm subpixel-antialiased lg:p-6"
		style:border-radius="var(--image-border-radius)"
		style:anchor-name="--code-{node.id}"
		use:highlight_editable_code={{
			content: node.content?.content ?? '',
			language: node.language,
			enabled: svedit.editable,
			composing: svedit.is_composing
		}}
	>
		{#if highlighted_segments}
			<pre
				class="overflow-x-auto wrap-normal whitespace-pre tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)">{#each highlighted_segments as segment, index (index)}<span
						class={segment.class_name}>{segment.text}</span
					>{/each}</pre>
		{:else}
			<TextProperty
				tag="pre"
				spellcheck={false}
				class="overflow-x-auto! wrap-normal! whitespace-pre! tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
				path={[...path, 'content']}
				placeholder="Code or plain text"
			/>
		{/if}
	</div>
{/snippet}

{#snippet narrow_left()}
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="max-w-4xl px-5 sm:px-7">
				{@render code()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_center()}
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="mx-auto max-w-4xl px-5 sm:px-7">
				{@render code()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet narrow_right()}
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div class="ml-auto max-w-4xl px-5 sm:px-7">
				{@render code()}
			</div>
		</div>
	</div>
{/snippet}

{#snippet wide()}
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			{@render code()}
		</div>
	</div>
{/snippet}

<Node class="ew-code-block bg-(--background) text-(--foreground)" {path}>
	{@const layouts = {
		'narrow-left': narrow_left,
		'narrow-center': narrow_center,
		'narrow-right': narrow_right,
		wide
	}}
	{@render layouts[layout]()}
</Node>
