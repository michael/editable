<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';

	let { path, mark: section = null } = $props();
	const svedit = get_svedit_context();
	let node: Nodes['descriptive_gallery'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'cards');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
	const carousel_id = $props.id();
	let can_go_previous = $state(false);
	let can_go_next = $state(false);
	let viewport: HTMLDivElement | undefined;

	function track_carousel(element: HTMLDivElement) {
		viewport = element;
		function update_navigation() {
			const direction = getComputedStyle(element).direction === 'rtl' ? -1 : 1;
			const max_position = Math.max(0, element.scrollWidth - element.clientWidth);
			// Clamp mobile overscroll without turning negative start positions into forward progress.
			const position = Math.max(0, Math.min(direction * element.scrollLeft, max_position));
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
		const items = viewport.querySelectorAll<HTMLElement>('.ew-descriptive-gallery-item');
		if (items.length < 2) return;
		const step = items[1].getBoundingClientRect().left - items[0].getBoundingClientRect().left;
		viewport.scrollBy({
			left: direction * step,
			behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
		});
	}
</script>

<Node class="ew-descriptive-gallery" {path}>
	<div class={layout === 'carousel' ? '@container w-full' : 'mx-auto w-full max-w-7xl'}>
		<div
			class={[
				layout !== 'carousel' && 'px-5 sm:px-7',
				padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
				padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
			]}
		>
			{#if layout === 'carousel'}
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
					class="relative snap-x snap-mandatory scroll-px-(--ew-carousel-inset) [scrollbar-width:none] overflow-x-auto overscroll-x-contain [--ew-carousel-card-width:calc(var(--ew-carousel-content)*0.85)] [--ew-carousel-content:calc(min(100cqw,80rem)-2*var(--ew-carousel-gutter))] [--ew-carousel-gutter:1.25rem] [--ew-carousel-inset:max(var(--ew-carousel-gutter),calc((100cqw-80rem)/2+var(--ew-carousel-gutter)))] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing) sm:[--ew-carousel-gutter:1.75rem] md:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-1.75rem)/2)] xl:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-3.5rem)/3)] [&::-webkit-scrollbar]:hidden"
					{@attach track_carousel}
				>
					<!-- Intrinsic track width includes both gutters in the scroll range. -->
					<NodeArrayProperty
						class="grid w-max min-w-full auto-cols-(--ew-carousel-card-width) grid-flow-col gap-5 px-(--ew-carousel-inset) [--row:1] sm:gap-7"
						path={[...path, 'items']}
					/>
				</div>
				<div
					class="mx-auto flex max-w-7xl justify-end gap-3 px-5 pt-5 sm:px-7"
					contenteditable="false"
				>
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
			{:else}
				<NodeArrayProperty
					class={layout === 'compact'
						? 'grid grid-cols-1 gap-x-10 gap-y-8 [--row:1] md:grid-cols-2 md:gap-y-7 lg:gap-x-14'
						: 'grid grid-cols-1 gap-x-5 gap-y-8 [--row:1] sm:gap-x-7 md:grid-cols-2 md:gap-y-7 xl:grid-cols-3'}
					path={[...path, 'items']}
				/>
			{/if}
		</div>
	</div>
</Node>
