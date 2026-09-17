<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty, TextProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
</script>

<Node class="ew-accordion-item border-b border-(--stroke) [--row:0]" {path}>
	<details class="py-2 md:py-3">
		<summary
			class="list-none outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
			class:pointer-events-none={svedit.editable}
			class:cursor-pointer={!svedit.editable}
		>
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<TextProperty class="body-base" path={[...path, 'title']} placeholder="Title" />
				</div>
				<div
					class="pointer-events-auto flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center text-(--muted-foreground) outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
					aria-label="Toggle accordion item"
				>
					<svg class="accordion-chevron size-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path
							d="M5 7.5L10 12.5L15 7.5"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</div>
			</div>
		</summary>
		<div class="py-3">
			<NodeArrayProperty class="flex flex-col gap-5 sm:gap-7" path={[...path, 'body']} />
		</div>
	</details>
</Node>

<style>
	:global(.ew-accordion-item summary::-webkit-details-marker) {
		display: none;
	}

	:global(.ew-accordion-item summary::marker) {
		content: '';
	}

	:global(.ew-accordion-item .accordion-chevron) {
		transition: transform 0.2s ease;
	}

	:global(.ew-accordion-item details[open] .accordion-chevron) {
		transform: rotate(180deg);
	}
</style>
