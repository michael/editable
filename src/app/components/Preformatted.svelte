<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { split_code_comments } from '#lib/code_comments.js';

	// De-emphasize // and /* */ comments in code blocks (view mode only).
	// Set to false to render all preformatted text uniformly.
	const dim_code_comments = true;

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['preformatted'] = $derived(svedit.session.get(path));
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	let comment_segments = $derived(
		dim_code_comments && !svedit.editable ? split_code_comments(node.content?.content ?? '') : null
	);
</script>

<Node class="ew-preformatted bg-(--background) text-(--foreground)" {path}>
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
			>
				{#if comment_segments}
					<pre
						class="overflow-x-auto wrap-normal whitespace-pre tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)">{#each comment_segments as segment, index (index)}{#if segment.comment}<span
									class="text-(--muted-foreground)">{segment.text}</span
								>{:else}{segment.text}{/if}{/each}</pre>
				{:else}
					<TextProperty
						tag="pre"
						class="overflow-x-auto! wrap-normal! whitespace-pre! tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
						path={[...path, 'content']}
						placeholder="Preformatted text"
					/>
				{/if}
			</div>
		</div>
	</div>
</Node>
