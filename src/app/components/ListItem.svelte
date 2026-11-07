<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';

	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let list_node = $derived(svedit.session.get(path.slice(0, -2)));
	let item_index = $derived(Number(path.at(-1)) || 0);
	let layout = $derived(list_node?.layout || 'decimal');
	let marker = $derived(get_marker(item_index + 1, layout));

	function get_marker(index, layout) {
		switch (layout) {
			case 'square':
				return '▪';
			case 'decimal':
				return `${String(index).padStart(2, '0')}.`;
			case 'lower-alpha':
				return `${to_latin(index)}.`;
			default:
				return '▪';
		}
	}

	function to_latin(index) {
		let value = index;
		let result = '';

		while (value > 0) {
			value -= 1;
			result = String.fromCharCode(97 + (value % 26)) + result;
			value = Math.floor(value / 26);
		}

		return result;
	}
</script>

<Node {path}>
	<div class="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 py-0" role="listitem">
		<!-- Markers are bold to match the eyebrows; the tick is drawn with a 2px stroke, which a glyph can't promise. -->
		<div
			contenteditable="false"
			class="text-right text-sm leading-7 font-bold text-(--accent) select-none"
			aria-hidden="true"
		>
			{#if layout === 'check'}
				<svg
					class="inline-block size-4 align-middle"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
				</svg>
			{:else}
				{marker}
			{/if}
		</div>
		<TextProperty
			class="leading-7 text-(--foreground)"
			path={[...path, 'content']}
			placeholder="List item"
		/>
	</div>
</Node>
