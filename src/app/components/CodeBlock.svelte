<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { lazy_highlight_editable_code as highlight_editable_code } from '#lib/lazy_highlight_editable_code.js';
	import { highlight_code } from '#lib/code_highlighting.js';
	import { tooltip } from '#app/tooltip.js';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['code_block'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'narrow-left');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	// Svedit's text styles wrap and are unlayered, so either choice overrides them.
	let line_classes = $derived(
		node.wrap_lines
			? 'whitespace-pre-wrap! wrap-anywhere!'
			: 'overflow-x-auto! whitespace-pre! wrap-normal!'
	);
	let highlighted_segments = $derived(
		!svedit.editable ? await highlight_code(node.content?.content ?? '', node.language) : null
	);
	let copied = $state(false);
	let copied_timeout: ReturnType<typeof setTimeout>;

	async function copy_code() {
		await navigator.clipboard.writeText(node.content?.content ?? '');
		copied = true;
		clearTimeout(copied_timeout);
		copied_timeout = setTimeout(() => (copied = false), 1500);
	}
</script>

{#snippet code()}
	<!-- The anchor places the code block controls in Overlays. -->
	<div
		class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 bg-(--muted) p-3 font-mono text-sm subpixel-antialiased lg:p-6"
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
				class="{line_classes} tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)">{#each highlighted_segments as segment, index (index)}<span
						class={segment.class_name}>{segment.text}</span
					>{/each}</pre>
		{:else}
			<TextProperty
				tag="pre"
				spellcheck={false}
				class="{line_classes} tab-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
				path={[...path, 'content']}
				placeholder="Code or plain text"
			/>
		{/if}
		<!-- A column of its own keeps the button off the code; it takes no more height than a line. -->
		<div class="-mt-1 -mr-1 -mb-2 flex lg:-my-2 lg:-mr-2" contenteditable="false">
			<button
				type="button"
				class="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) text-(--foreground) transition-colors duration-150 hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 lg:size-9"
				aria-label="Copy code"
				use:tooltip={{ label: 'Copy code' }}
				onclick={copy_code}
			>
				<svg class="size-5 lg:size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					{#if copied}
						<path
							d="M5 12.5L9.5 17L19 7.5"
							stroke="currentColor"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					{:else}
						<rect x="8.5" y="8.5" width="11" height="11" rx="2" stroke="currentColor" />
						<path
							d="M15.5 8.5V6.5C15.5 5.39543 14.6046 4.5 13.5 4.5H6.5C5.39543 4.5 4.5 5.39543 4.5 6.5V13.5C4.5 14.6046 5.39543 15.5 6.5 15.5H8.5"
							stroke="currentColor"
						/>
					{/if}
				</svg>
			</button>
			<span class="sr-only" aria-live="polite">{copied ? 'Code copied' : ''}</span>
		</div>
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
