<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { NodeArrayProperty, Node } from 'svedit';
	import { slide } from 'svelte/transition';
	import NavMedia from './NavMedia.svelte';
	import NavButton from './NavButton.svelte';
	import LanguageSwitcher from './LanguageSwitcher.svelte';

	let { path }: { path: DocumentPath } = $props();

	const svedit = get_svedit_context();
	let node: Nodes['nav'] = $derived(svedit.session.get(path));
	let middle_item_ids = $derived(node.middle_items.nodes);
	let mobile_nav_media_path = $derived(find_mobile_nav_media_path());
	let mobile_nav_cta_path = $derived(find_mobile_nav_cta_path());
	let mobile_nav_open = $state(false);

	function find_mobile_nav_media_path() {
		for (const item_property_name of ['start_items', 'middle_items', 'end_items']) {
			const items = node?.[item_property_name]?.nodes || [];
			for (let index = 0; index < items.length; index++) {
				const item = svedit.session.get([...path, item_property_name, index]);
				if (item?.type === 'nav_media') {
					return [item.id];
				}
			}
		}

		return null;
	}

	function find_mobile_nav_cta_path() {
		for (const item_property_name of ['start_items', 'middle_items', 'end_items']) {
			const items = node?.[item_property_name]?.nodes || [];
			for (let index = 0; index < items.length; index++) {
				const item = svedit.session.get([...path, item_property_name, index]);
				if (item?.type === 'nav_button' && item.layout === 'primary') {
					return [item.id];
				}
			}
		}

		return null;
	}

	$effect(() => {
		if (mobile_nav_open) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}

		return () => {
			document.body.style.overflow = '';
		};
	});
</script>

{#snippet menu_icon(open)}
	<svg class="h-6 w-6 stroke-(--foreground)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		{#if open}
			<path
				stroke-linecap="square"
				stroke-linejoin="miter"
				stroke-width="1.5"
				d="M6 18L18 6M6 6l12 12"
			/>
		{:else}
			<path
				stroke-linecap="square"
				stroke-linejoin="miter"
				stroke-width="1.5"
				d="M4 8h16M4 16h16"
			/>
		{/if}
	</svg>
{/snippet}

<Node {path}>
	<!-- Desktop nav (visible also during mobile editing) -->
	<div
		class="relative mx-auto max-w-7xl overflow-x-auto overflow-y-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
		class:max-lg:hidden={!svedit.editable}
	>
		<div
			class="grid min-h-17 grid-cols-[max-content_max-content_max-content] items-center gap-x-12 px-5 py-4 text-sm sm:px-7 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-6"
		>
			<NodeArrayProperty
				tag="div"
				class="flex flex-wrap items-center gap-2 [--row:1] *:min-w-max max-lg:flex-nowrap [&>.empty-node-placeholder]:min-h-9"
				path={[...path, 'start_items']}
			/>
			<NodeArrayProperty
				tag="nav"
				class="flex w-max flex-wrap items-center gap-x-6 gap-y-1 [--row:1] *:min-w-max max-lg:flex-nowrap [&>.empty-node-placeholder]:min-h-9"
				path={[...path, 'middle_items']}
			/>
			<div class="flex items-center justify-end gap-2">
				<LanguageSwitcher />
				<NodeArrayProperty
					tag="div"
					class="flex flex-wrap items-center justify-end gap-2 [--row:1] *:min-w-max max-lg:flex-nowrap [&>.empty-node-placeholder]:min-h-9"
					path={[...path, 'end_items']}
				/>
			</div>
		</div>
	</div>

	<!-- Mobile nav in read mode -->
	<div class="mx-auto max-w-7xl lg:hidden" class:hidden={svedit.editable}>
		<div class="flex min-h-17 items-center gap-6 px-5 py-4 text-sm sm:px-7">
			{#if mobile_nav_media_path}
				<NavMedia path={mobile_nav_media_path} />
			{/if}
			<div class="flex-1"></div>
			<div class="flex items-center gap-2">
				<LanguageSwitcher />
				{#if mobile_nav_cta_path}
					<NavButton path={mobile_nav_cta_path} />
				{/if}
				<button
					class="inline-flex size-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					onclick={() => (mobile_nav_open = !mobile_nav_open)}
					aria-label="Toggle menu"
					aria-expanded={mobile_nav_open}
				>
					{@render menu_icon(mobile_nav_open)}
				</button>
			</div>
		</div>
	</div>

	{#if mobile_nav_open}
		<div
			class="fixed inset-0 z-50 bg-(--background) text-(--foreground) lg:hidden"
			contenteditable="false"
			transition:slide={{ duration: 200 }}
		>
			<button
				class="absolute top-4 right-5 inline-flex size-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40 sm:right-7"
				onclick={() => (mobile_nav_open = false)}
				aria-label="Close menu"
			>
				{@render menu_icon(true)}
			</button>

			<nav class="flex flex-col gap-1 px-5 pt-20 pb-5 sm:px-7">
				{#each middle_item_ids as _node_id, index (index)}
					{@const item = svedit.session.get([...path, 'middle_items', index])}
					{#if item.type === 'nav_link'}
						<a
							href={item.href || '#'}
							target={item.target !== '_self' ? item.target : undefined}
							class="flex min-h-11 items-center py-2 text-3xl leading-tight font-normal wrap-anywhere text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
							onclick={() => (mobile_nav_open = false)}
						>
							{item.label?.content || ''}
						</a>
					{/if}
				{/each}
			</nav>
		</div>
	{/if}
</Node>
