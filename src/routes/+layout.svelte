<script lang="ts">
	import { onNavigate } from '$app/navigation';

	import '../app.css';

	let { data, children } = $props();

	$effect(() => {
		if (data.languages?.length && data.language) document.documentElement.lang = data.language;
	});

	onNavigate((navigation) => {
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
		<link rel="icon" type={data.favicon.type ?? undefined} href={data.favicon.href} />
	{/if}
</svelte:head>
{@render children()}
