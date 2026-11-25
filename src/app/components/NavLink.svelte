<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';
	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['nav_link'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
</script>

<!-- Two layers, as in Button: the outer element is the click and hover target and never moves, and
the inner label takes its hover styles from it with group-hover/nav-link:, ignoring the pointer while
viewing. -->
<Node class="flex items-center" {path}>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		class="group/nav-link inline-flex min-h-9 items-center py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
	>
		<span
			class={[
				'inline-flex text-sm leading-5 text-(--foreground) transition-colors group-hover/nav-link:text-(--muted-foreground) group-active/nav-link:text-(--muted-foreground)',
				render_as_link && 'pointer-events-none'
			]}
		>
			<TextProperty path={[...path, 'label']} placeholder="Link" />
		</span>
	</svelte:element>
</Node>
