<script lang="ts">
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import App from './App.svelte';

	/**
	 * A page whose body is a route's own content, such as a shop's checkout: the
	 * site's banner, nav, and footer, already in the visitor's language, the
	 * toolbar, and the login drawer, around children.
	 */
	let {
		title,
		description = '',
		children
	}: {
		/** The page's title, for its <title> and link previews. */
		title: string;
		/** The page's description, for search results and link previews. */
		description?: string;
		children: Snippet;
	} = $props();

	const text = (content: string) => ({ content, marks: [], annotations: [] });

	let document = $derived.by(() => {
		const shell = structuredClone(page.data.page_shell);
		const root = shell.nodes[shell.document_id];
		root.title = text(title);
		root.description = text(description);
		return shell;
	});
</script>

<App {...page.data} {document} can_edit={false}>
	{@render children()}
</App>
