<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { NodeArrayProperty } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';

	let { path, layout = 'carousel-3-columns' }: { path: DocumentPath; layout?: string } = $props();
	let is_compact = $derived(layout === 'carousel-compact');
	// Cards take most of the width on phones, two from md, and three on wide screens in
	// the 3-column layout. Compact tiles keep a fixed width and scroll only when they overflow.
	let card_width = $derived(
		is_compact
			? '[--ew-carousel-card-width:8rem] sm:[--ew-carousel-card-width:9rem]'
			: `[--ew-carousel-card-width:calc(var(--ew-carousel-content)*0.85)] md:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-1.75rem)/2)] ${layout === 'carousel-3-columns' ? 'xl:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-3.5rem)/3)]' : ''}`
	);
	const svedit = get_svedit_context();
	const carousel_id = $props.id();
	let can_go_previous = $state(false);
	let can_go_next = $state(false);
	// Compact strips fade out toward more items: clear up to the page gutter, where the arrow starts,
	// then up to full opacity 5rem further in, so content under the arrow stays faint. Editing skips
	// the fade so selections at the edges stay visible.
	let edge_fade = $derived(
		!is_compact || svedit.editable
			? ''
			: can_go_previous && can_go_next
				? 'mask-[linear-gradient(to_right,transparent_var(--ew-carousel-gutter),black_calc(var(--ew-carousel-gutter)+5rem),black_calc(100%-var(--ew-carousel-gutter)-5rem),transparent_calc(100%-var(--ew-carousel-gutter)))]'
				: can_go_next
					? 'mask-[linear-gradient(to_right,black_calc(100%-var(--ew-carousel-gutter)-5rem),transparent_calc(100%-var(--ew-carousel-gutter)))]'
					: can_go_previous
						? 'mask-[linear-gradient(to_right,transparent_var(--ew-carousel-gutter),black_calc(var(--ew-carousel-gutter)+5rem))]'
						: ''
	);
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

{#snippet arrow(direction: -1 | 1, can_go: boolean, position = '')}
	<button
		type="button"
		aria-label={direction < 0 ? 'Previous gallery item' : 'Next gallery item'}
		aria-controls={carousel_id}
		disabled={!can_go}
		onclick={() => scroll_carousel(direction)}
		class="inline-flex shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--muted) text-(--foreground) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_5%)] enabled:active:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_10%)] disabled:cursor-default disabled:opacity-40 {position ||
			'size-11'}"
	>
		<svg
			class="size-5 rtl:rotate-180"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d={direction < 0 ? 'm14 7-5 5 5 5' : 'm10 7 5 5-5 5'} /></svg
		>
	</button>
{/snippet}

<div class="@container w-full">
	<!-- The geometry lives on a wrapper inside the container, so cqw measures the container. Card
	carousels scroll across the full width with page-aligned gutters; compact ones stay within the
	page width, so their gutter is the whole inset. -->
	<div
		class="relative [--ew-carousel-gutter:1.25rem] sm:[--ew-carousel-gutter:1.75rem] {card_width} {is_compact
			? 'mx-auto max-w-7xl [--ew-carousel-inset:var(--ew-carousel-gutter)]'
			: '[--ew-carousel-content:calc(min(100cqw,80rem)-2*var(--ew-carousel-gutter))] [--ew-carousel-inset:max(var(--ew-carousel-gutter),calc((100cqw-80rem)/2+var(--ew-carousel-gutter)))]'}"
	>
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
			class="relative -my-1 scrollbar-none {svedit.editable
				? 'snap-none'
				: 'snap-x snap-mandatory'} scroll-px-(--ew-carousel-inset) overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing) {edge_fade} [&::-webkit-scrollbar]:hidden"
			{@attach track_carousel}
		>
			<!-- Keep gutters outside the node array so its trailing anchor ends at the last card. -->
			<div class="ew-carousel-track w-max min-w-full px-(--ew-carousel-inset) py-1">
				<NodeArrayProperty
					class="grid auto-cols-(--ew-carousel-card-width) grid-flow-col gap-5 [--row:1] sm:gap-7"
					{path}
				/>
			</div>
		</div>
		<!-- Compact carousels overlay their arrows inside the page gutter, aligned with the content,
		only toward more items, so they never take layout space. -->
		{#if is_compact}
			<div contenteditable="false">
				{#if can_go_previous}
					{@render arrow(
						-1,
						true,
						'absolute top-1/2 left-(--ew-carousel-gutter) size-9 -translate-y-1/2 shadow-sm'
					)}
				{/if}
				{#if can_go_next}
					{@render arrow(
						1,
						true,
						'absolute top-1/2 right-(--ew-carousel-gutter) size-9 -translate-y-1/2 shadow-sm'
					)}
				{/if}
			</div>
		{/if}
	</div>
	{#if !is_compact && (can_go_previous || can_go_next)}
		<div class="mx-auto flex max-w-7xl justify-end gap-3 px-5 pt-5 sm:px-7" contenteditable="false">
			{@render arrow(-1, can_go_previous)}
			{@render arrow(1, can_go_next)}
		</div>
	{/if}
</div>
