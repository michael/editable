<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';

	import '../app.css';

	let { data, children } = $props();

	$effect(() => {
		if (data.languages?.length && data.language) document.documentElement.lang = data.language;
	});

	onNavigate((navigation) => {
		if (navigation.shallow) return;
		if (typeof document.startViewTransition !== 'function') return;

		return new Promise<void>((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	{#if data.favicon}
		<link
			rel="icon"
			type={data.favicon.type ?? undefined}
			href={resolve_href(data.favicon.href, site)}
		/>
	{/if}
</svelte:head>
{@render children()}
