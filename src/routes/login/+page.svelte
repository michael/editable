<script lang="ts">
	import { goto } from '$app/navigation';
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';
	import { document_config } from '#app/document_config.js';

	let { data } = $props();
	// The site's login dialog, the same one ⌘ E opens.
	const AuthDialog = document_config.system_components.auth_dialog;
</script>

<svelte:head>
	<title>Log in</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="flex min-h-dvh items-center justify-center bg-(--background) px-5 py-10 text-(--foreground)"
>
	<div
		class="flex w-full max-w-md flex-col gap-6 rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) px-6 py-8 text-center"
	>
		<AuthDialog
			onlogin_success={() =>
				goto(resolve_href(data.redirect_to, site), { replaceState: true, invalidateAll: true })}
		/>
	</div>
</main>
