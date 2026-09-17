<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import { get_app_context } from '#app/app_context.js';
	import type { DocumentPath } from 'svedit';
	import type { Nodes } from '#app/document_schema.js';
	import { TextProperty, Node, NodeArrayProperty } from 'svedit';
	import Nav from './Nav.svelte';
	import Footer from './Footer.svelte';
	import MediaProperty from './MediaProperty.svelte';
	import { extract_page_metadata, get_social_image } from '#app/page_metadata.js';
	import TableOfContents, { type TocEntry } from './TableOfContents.svelte';

	const svedit = get_svedit_context();
	const app = get_app_context();
	let { path }: { path: DocumentPath } = $props();
	let nav_wrapper_ref: HTMLDivElement | undefined = $state();
	let nav_height = $state(0);
	let scroll_y = $state(0);
	let head_metadata = $derived(extract_page_metadata(svedit.session.doc));
	let page_title = $derived(app.document_title ?? (head_metadata.title || 'Untitled page'));
	let page_image: Nodes['image'] = $derived(svedit.session.get([...path, 'image']));
	let page_image_is_svg = $derived(
		page_image?.mime_type
			? page_image.mime_type === 'image/svg+xml'
			: page_image?.src?.toLowerCase().endsWith('.svg')
	);
	let canonical_url = $derived(
		app.origin && !app.is_new ? `${app.origin}${app.slug ? `/${app.slug}` : '/'}` : null
	);
	let social_image = $derived(get_social_image(head_metadata.preview_media_node));
	let social_image_url = $derived(social_image ? `${app.origin || ''}${social_image.url}` : null);
	let toc_source = $derived.by(() => {
		const body_node_ids = svedit.session.get([...path, 'body'])?.nodes || [];

		for (let body_index = 0; body_index < Math.min(body_node_ids.length, 3); body_index++) {
			const body_node = svedit.session.get([...path, 'body', body_index]);
			if (body_node?.type !== 'listing' && body_node?.type !== 'descriptive_listing') continue;

			const entries: TocEntry[] = [];
			for (let item_index = 0; item_index < body_node.items.nodes.length; item_index++) {
				const item = svedit.session.get([...path, 'body', body_index, 'items', item_index]);
				if (!item?.href) continue;
				entries.push({
					href: item.href,
					title: item.title?.content?.trim() || item.href
				});
			}

			if (entries.length > 3) return { source_node_id: body_node.id, entries };
		}

		return null;
	});

	// In view mode the nav is sticky, so offset anchor scrolls (e.g. /manual#quickstart)
	// by twice the nav height to prevent content from being covered and leave some space.
	$effect(() => {
		const el = nav_wrapper_ref;
		if (svedit.editable || !el) return;

		const update_scroll_padding_top = () => {
			const next_nav_height = el.offsetHeight;
			nav_height = next_nav_height;
			document.documentElement.style.scrollPaddingTop = `${2 * next_nav_height}px`;
		};
		const align_hash_target = () => {
			const target_id = window.location.hash.slice(1);
			if (!target_id) return;

			const target = document.getElementById(decodeURIComponent(target_id));
			if (!target) return;

			const offset = target.getBoundingClientRect().top - 2 * el.offsetHeight;
			if (Math.abs(offset) > 1) window.scrollBy(0, offset);
		};

		update_scroll_padding_top();
		const frame_id = requestAnimationFrame(() => {
			update_scroll_padding_top();
			align_hash_target();
		});

		const observer = new ResizeObserver(update_scroll_padding_top);
		observer.observe(el);

		return () => {
			cancelAnimationFrame(frame_id);
			observer.disconnect();
			nav_height = 0;
			document.documentElement.style.scrollPaddingTop = '';
		};
	});
</script>

<svelte:window bind:scrollY={scroll_y} />

<svelte:head>
	<title>{page_title}</title>
	{#if head_metadata.description}
		<meta name="description" content={head_metadata.description} />
		<meta property="og:description" content={head_metadata.description} />
		<meta name="twitter:description" content={head_metadata.description} />
	{/if}
	<meta property="og:title" content={page_title} />
	<meta property="og:type" content="website" />
	{#if canonical_url}
		<link rel="canonical" href={canonical_url} />
		<meta property="og:url" content={canonical_url} />
	{/if}
	<meta name="twitter:card" content={social_image_url ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={page_title} />
	{#if social_image_url && social_image}
		<meta property="og:image" content={social_image_url} />
		{#if social_image.width && social_image.height}
			<meta property="og:image:width" content={String(social_image.width)} />
			<meta property="og:image:height" content={String(social_image.height)} />
		{/if}
		{#if social_image.alt}
			<meta property="og:image:alt" content={social_image.alt} />
		{/if}
		<meta name="twitter:image" content={social_image_url} />
	{/if}
</svelte:head>

<Node {path}>
	<div class="page flex min-h-screen flex-col [--row:0]">
		<div
			bind:this={nav_wrapper_ref}
			class="bg-(--background) text-(--foreground)"
			class:sticky={!svedit.editable}
			class:top-0={!svedit.editable}
			class:z-40={!svedit.editable}
			class:shadow-sm={!svedit.editable && scroll_y > 0}
		>
			<Nav path={[...path, 'nav']} />
		</div>
		{#if !svedit.editable && toc_source}
			<TableOfContents
				source_node_id={toc_source.source_node_id}
				entries={toc_source.entries}
				{nav_height}
			/>
		{/if}
		<div class="grow" style="anchor-name: --page-body; --node-caret-boundary: --page-body;">
			{#if !svedit.editable && app.page_content}
				{@render app.page_content()}
			{:else}
				<NodeArrayProperty class="body-node-array" path={[...path, 'body']} />
			{/if}
		</div>
		<div class="bg-(--background) text-(--foreground)">
			<Footer path={[...path, 'footer']} />
		</div>
		{#if svedit.editable}
			<div class="border-t border-(--stroke) bg-(--muted) text-(--foreground)">
				<div class="mx-auto max-w-xl">
					<div class="px-5 py-24 sm:px-7">
						<div class="grid w-full max-w-xl grid-cols-[6rem_minmax(0,1fr)] items-center gap-4">
							<div class="aspect-square w-24">
								<MediaProperty path={[...path, 'image']} />
							</div>
							<div class="flex flex-col justify-center gap-2">
								<TextProperty
									path={[...path, 'title']}
									placeholder="Page title"
									class="block body-base font-medium"
								/>
								<TextProperty
									path={[...path, 'description']}
									placeholder="Write a clear summary of this page for search results. Explain what people will find here in 1–2 sentences. Aim for specific, human-readable copy rather than keywords."
									class="block body-sm text-(--muted-foreground)"
								/>
							</div>
							{#if page_image_is_svg}
								<p
									contenteditable="false"
									role="alert"
									class="col-span-2 self-start body-sm text-(--editing)"
								>
									This SVG won’t work as a page preview on Google, WhatsApp, and other services. Use
									a PNG, JPEG, or WebP instead.
								</p>
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</Node>
