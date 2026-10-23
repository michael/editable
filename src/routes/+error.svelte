<script lang="ts">
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import PageShell from '#app/components/PageShell.svelte';

	let is_not_found = $derived(page.status === 404);
	// Only offer to go back when there is somewhere to go, which the server cannot know.
	let can_go_back = $state(false);
	onMount(() => {
		can_go_back = history.length > 1;
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<PageShell title={is_not_found ? 'Page not found' : 'Something went wrong'}>
	<div
		class="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center px-5 py-24 sm:px-7 sm:py-32"
	>
		<div class="max-w-2xl space-y-5 text-center text-balance">
			<p class="display-1 text-(--muted-foreground)">{page.status}</p>
			<h1 class="display-3">
				{is_not_found ? 'Page not found.' : 'Something went wrong.'}
			</h1>
			<p class="mx-auto max-w-xl body-base text-(--muted-foreground)">
				{is_not_found
					? "The page you're looking for doesn't exist or may have moved."
					: 'Please try again, or return to the home page.'}
			</p>
			<div class="flex flex-wrap items-center justify-center gap-3">
				{#if can_go_back}
					<button
						type="button"
						class="ew-button ew-button-secondary inline-flex min-h-11 max-w-full min-w-11 cursor-pointer items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-5 py-2 text-base leading-6 font-normal wrap-anywhere text-(--foreground) transition hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10"
						onclick={() => history.back()}
					>
						← Go back
					</button>
				{/if}
				<a
					href={resolve_href('/', site)}
					class="ew-button inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-base leading-6 font-normal wrap-anywhere text-(--accent-foreground) transition hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]"
				>
					Go to home page
				</a>
			</div>
		</div>
	</div>
</PageShell>
