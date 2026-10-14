<script lang="ts">
	export type TocEntry = {
		href: string;
		title: string;
	};

	let {
		source_node_id,
		entries,
		nav_height
	}: { source_node_id: string; entries: TocEntry[]; nav_height: number } = $props();

	let toc_visible = $state(false);
	let active_entry_index = $state(0);
	const toc_id = $props.id();
	let toc_menu_ref: HTMLElement | undefined = $state();
	let toc_open = $state(false);

	function get_target_element(href: string) {
		const target_url = new URL(href, window.location.href);
		if (
			target_url.origin !== window.location.origin ||
			target_url.pathname !== window.location.pathname ||
			!target_url.hash
		) {
			return null;
		}

		return document.getElementById(decodeURIComponent(target_url.hash.slice(1)));
	}

	function update_toc() {
		const source_element = document.getElementById(source_node_id);
		if (!source_element) return;

		toc_visible = source_element.getBoundingClientRect().bottom <= nav_height;
		if (!toc_visible) toc_open = false;

		const page_height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
		if (window.scrollY + window.innerHeight >= page_height - 5) {
			active_entry_index = entries.length - 1;
			return;
		}

		const scroll_target_offset = 2 * nav_height + 5;
		let next_active_entry_index = 0;
		for (let index = 0; index < entries.length; index++) {
			const target_element = get_target_element(entries[index].href);
			if (target_element && target_element.getBoundingClientRect().top <= scroll_target_offset) {
				next_active_entry_index = index;
			}
		}
		active_entry_index = next_active_entry_index;
	}

	function close_toc_menu() {
		if (toc_menu_ref?.matches(':popover-open')) toc_menu_ref.hidePopover();
	}

	$effect(() => {
		source_node_id;
		entries;
		nav_height;

		const frame_id = requestAnimationFrame(update_toc);
		const observer = new ResizeObserver(update_toc);
		observer.observe(document.body);

		return () => {
			cancelAnimationFrame(frame_id);
			observer.disconnect();
		};
	});
</script>

<svelte:window onscroll={update_toc} onresize={update_toc} />

{#if toc_visible}
	<div
		class="fixed left-1/2 z-30 -translate-x-1/2 pt-4"
		style={`top: ${nav_height}px;`}
		aria-label="Table of contents"
	>
		<div
			style:anchor-name={`--toc-${toc_id}`}
			class="group relative max-w-[calc(100vw-2.5rem)] min-w-0 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-sm leading-5 text-(--foreground)"
		>
			<button
				type="button"
				popovertarget={toc_id}
				aria-expanded={toc_open}
				class="relative flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] px-3 py-2 font-medium whitespace-nowrap hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10"
			>
				<span class="min-w-0 truncate">{entries[active_entry_index]?.title}</span>
				<svg
					class="size-4 shrink-0 text-(--muted-foreground)"
					class:rotate-180={toc_open}
					viewBox="0 0 12 12"
					fill="none"
					aria-hidden="true"
				>
					<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.25" />
				</svg>
			</button>
			<nav
				id={toc_id}
				bind:this={toc_menu_ref}
				popover="auto"
				style:position-anchor={`--toc-${toc_id}`}
				ontoggle={(event) => (toc_open = event.newState === 'open')}
				class="toc-menu max-h-[min(24rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-y-auto overscroll-contain rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing) [&:popover-open]:flex"
				aria-label="Table of contents"
			>
				{#each entries as entry, index (entry.href)}
					<a
						href={entry.href}
						class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere whitespace-normal text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
						aria-current={index === active_entry_index ? 'location' : undefined}
						onclick={close_toc_menu}
					>
						{entry.title}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}

<style>
	.toc-menu {
		position: fixed;
		/* Center against the viewport, independently of the pill’s translated anchor. */
		inset: auto 0;
		top: anchor(bottom);
		margin: 8px auto 0;
	}
</style>
