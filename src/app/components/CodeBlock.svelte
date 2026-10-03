<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { lazy_highlight_editable_code as highlight_editable_code } from '#lib/lazy_highlight_editable_code.js';
	import { highlight_code } from '#lib/code_highlighting.js';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['code_block'] = $derived(svedit.session.get(path));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let highlighted_segments = $derived(
		!svedit.editable ? await highlight_code(node.content?.content ?? '', node.layout) : null
	);
</script>

<Node class="ew-code-block bg-(--background) text-(--foreground)" {path}>
	<div class="mx-auto w-full max-w-7xl">
		<div
			class={[
				`px-4 px-5 sm:px-5 sm:px-7 md:px-6`,
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			<div
				class="border border-(--stroke) bg-(--muted) p-3 font-mono text-sm subpixel-antialiased lg:p-6"
				style:border-radius="var(--image-border-radius)"
				use:highlight_editable_code={{
					content: node.content?.content ?? '',
					language: node.layout,
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
		</div>
	</div>
</Node>
