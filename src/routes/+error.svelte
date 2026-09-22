<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import App from '#app/components/App.svelte';

	let is_not_found = $derived(page.status === 404);
</script>

<svelte:head>
	<meta name="robots" content="noindex" />
</svelte:head>

<App
	document={page.data.not_found_document}
	has_backend={page.data.has_backend}
	is_admin={page.data.is_admin}
	origin={page.data.origin}
	document_title={is_not_found ? 'Page not found' : 'Something went wrong'}
	slug={null}
	can_edit={false}
>
	<div
		class="mx-auto flex min-h-[60vh] w-full max-w-7xl items-center justify-center px-5 py-24 sm:px-7 sm:py-32"
	>
		<div class="max-w-2xl space-y-5 text-center text-balance">
			<p class="font-mono text-sm font-medium text-(--editing)">{page.status}</p>
			<h1 class="display-2">
				{is_not_found ? 'Page not found.' : 'Something went wrong.'}
			</h1>
			<p class="mx-auto max-w-xl body-base text-(--muted-foreground)">
				{is_not_found
					? "The page you're looking for doesn't exist or may have moved."
					: 'Please try again, or return to the home page.'}
			</p>
			<a
				href={resolve('/')}
				class="ew-button inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-base leading-6 font-medium wrap-anywhere text-(--accent-foreground) hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]"
			>
				Back home
			</a>
		</div>
	</div>
</App>
