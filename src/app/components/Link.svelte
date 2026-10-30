<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { resolve } from '$app/paths';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { serialize_path } from 'svedit';
	const svedit = get_svedit_context();
	let { path, content }: { path: DocumentPath; content: string } = $props();
	let node: Nodes['link'] = $derived(svedit.session.get(path));

	function get_link_href(href) {
		if (!href) return undefined;
		if (!href.startsWith('/')) return href;
		if (href === '/') return resolve('/');
		return resolve(href.slice(1) as PathnameWithSearchOrHash);
	}
</script>

<svelte:element
	this={svedit.editable ? 'span' : 'a'}
	id={node.id}
	data-node-id={node.id}
	{...{
		href: !svedit.editable ? get_link_href(node?.href) : undefined,
		target: !svedit.editable && node?.target !== '_self' ? node?.target : undefined
	}}
	class="underline decoration-[color-mix(in_oklab,currentColor_30%,transparent)] decoration-[0.0625em] underline-offset-[0.15em] transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:decoration-current"
	style="anchor-name: --{serialize_path(path)};">{content}</svelte:element
>
