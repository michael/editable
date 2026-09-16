<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { NodeArrayProperty } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';

	let { path }: { path: DocumentPath } = $props();
	const svedit = get_svedit_context();
	const carousel_id = $props.id();
	let can_go_previous = $state(false);
	let can_go_next = $state(false);
	let viewport: HTMLDivElement | undefined;

	function track_carousel(element: HTMLDivElement) {
		viewport = element;
		function update_navigation() {
			const max_position = Math.max(0, element.scrollWidth - element.clientWidth);
			// Clamp mobile overscroll without turning negative start positions into forward progress.
			const position = Math.max(0, Math.min(element.scrollLeft, max_position));
			can_go_previous = position > 1;
			can_go_next = position < max_position - 1;
		}
		const resize_observer = new ResizeObserver(update_navigation);
		resize_observer.observe(element);
		if (element.firstElementChild) resize_observer.observe(element.firstElementChild);
		const mutation_observer = new MutationObserver(update_navigation);
		mutation_observer.observe(element, { childList: true, subtree: true });
		element.addEventListener('scroll', update_navigation, { passive: true });
		update_navigation();
		return () => {
			resize_observer.disconnect();
			mutation_observer.disconnect();
			element.removeEventListener('scroll', update_navigation);
			viewport = undefined;
		};
	}

	function scroll_carousel(direction: number) {
		if (!viewport) return;
		const items = viewport.querySelectorAll<HTMLElement>(
			':scope > .ew-carousel-track > [data-type="node_array"] > [data-type="node"]'
		);
		if (items.length < 2) return;
		const step = items[1].getBoundingClientRect().left - items[0].getBoundingClientRect().left;
		viewport.scrollBy({
			left: direction * step,
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
		});
	}
</script>

<div class="@container w-full">
	<!-- Editing uses free scrolling so selection and node gap updates do not trigger snapping. -->
	<!-- Full-width scrolling with page-aligned gutters inside leaves room for edge gaps. -->
	<!-- Keep node gap positioning local to the scrolling container, as in Nav. -->
	<!-- Keep editing focus on Svedit's canvas so it can process text selections. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable region needs keyboard access in viewing mode.) -->
	<div
		id={carousel_id}
		role="region"
		aria-label="Gallery"
		aria-roledescription="carousel"
		tabindex={svedit.editable ? undefined : 0}
		class="[scrollbar-none] relative {svedit.editable
			? 'snap-none'
			: 'snap-x snap-mandatory'} scroll-px-(--ew-carousel-inset) overflow-x-auto overscroll-x-contain [--ew-carousel-card-width:calc(var(--ew-carousel-content)*0.85)] [--ew-carousel-content:calc(min(100cqw,80rem)-2*var(--ew-carousel-gutter))] [--ew-carousel-gutter:1.25rem] [--ew-carousel-inset:max(var(--ew-carousel-gutter),calc((100cqw-80rem)/2+var(--ew-carousel-gutter)))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing) sm:[--ew-carousel-gutter:1.75rem] md:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-1.75rem)/2)] xl:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-3.5rem)/3)] [&::-webkit-scrollbar]:hidden"
		{@attach track_carousel}
	>
		<!-- Keep gutters outside the node array so its trailing anchor ends at the last card. -->
		<div class="ew-carousel-track w-max min-w-full px-(--ew-carousel-inset)">
			<NodeArrayProperty
				class="grid auto-cols-(--ew-carousel-card-width) grid-flow-col gap-5 [--row:1] sm:gap-7"
				{path}
			/>
		</div>
	</div>
	{#if can_go_previous || can_go_next}
		<div class="mx-auto flex max-w-7xl justify-end gap-3 px-5 pt-5 sm:px-7" contenteditable="false">
			<button
				type="button"
				aria-label="Previous gallery item"
				aria-controls={carousel_id}
				disabled={!can_go_previous}
				onclick={() => scroll_carousel(-1)}
				class="inline-flex size-11 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
			>
				<svg
					class="size-5 rtl:rotate-180"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg
				>
			</button>
			<button
				type="button"
				aria-label="Next gallery item"
				aria-controls={carousel_id}
				disabled={!can_go_next}
				onclick={() => scroll_carousel(1)}
				class="inline-flex size-11 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
			>
				<svg
					class="size-5 rtl:rotate-180"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg
				>
			</button>
		</div>
	{/if}
</div>
