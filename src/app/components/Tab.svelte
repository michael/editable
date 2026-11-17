<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { page } from '$app/state';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['tab'] = $derived(svedit.session.get(path));
	let render_as_link = $derived(!svedit.editable && node.href);
	// Hrefs arrive under the base path, so they compare with the URL as is.
	let is_current = $derived(
		!!node.href && URL.parse(node.href, page.url.href)?.pathname === page.url.pathname
	);
</script>

<!-- A pill interior: the button radius minus the shell's padding and border. The current tab takes
the primary fill; the others darken the shell's muted fill on hover. -->
<Node class="flex" {path}>
	<svelte:element
		this={render_as_link ? 'a' : 'div'}
		href={render_as_link ? node.href : undefined}
		target={render_as_link && node.target !== '_self' ? node.target : undefined}
		aria-current={is_current ? 'page' : undefined}
		class={[
			'inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] px-4 py-1.5 text-center text-sm leading-5 font-normal wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)',
			is_current
				? 'ew-native-selection bg-(--foreground) text-(--background)'
				: 'text-(--foreground)',
			render_as_link &&
				!is_current &&
				'transition-colors hover:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_5%)] active:bg-[color-mix(in_srgb,var(--muted),var(--foreground)_10%)]'
		]}
	>
		<TextProperty path={[...path, 'label']} placeholder="Tab" />
	</svelte:element>
</Node>
