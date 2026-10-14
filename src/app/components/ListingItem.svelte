<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	import { reveal } from '#app/reveal.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['listing_item'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
	let display_meta = $derived(svedit.editable || !!node.meta?.content?.trim());
</script>

<Node class="listing-item group border-b border-(--stroke)" {path}>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="group/listing-link block py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) sm:py-2 md:py-3"
		use:reveal
	>
		<div class="flex items-center justify-between gap-6">
			<div class="min-w-2/3 flex-1">
				<TextProperty
					class="body-base {node.href
						? 'underline decoration-[0.0625em] underline-offset-[0.125em]'
						: ''} {render_as_link
						? 'group-hover/listing-link:decoration-[0.125em] group-active/listing-link:decoration-[0.125em]'
						: ''}"
					path={[...path, 'title']}
					placeholder="Title"
				/>
			</div>

			{#if display_meta}
				<div class="min-w-0 self-center text-right">
					<TextProperty
						class="body-base text-(--muted-foreground)"
						path={[...path, 'meta']}
						placeholder="Meta"
					/>
				</div>
			{/if}
		</div>
	</svelte:element>
</Node>
