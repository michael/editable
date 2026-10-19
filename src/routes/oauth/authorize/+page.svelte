<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { document_config } from '#app/document_config.js';

	let { data, form } = $props();
	// The site's login dialog, so a sign-in of your own works here too.
	const AuthDialog = document_config.system_components.auth_dialog;
</script>

<svelte:head>
	<title>Connect an app</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="flex min-h-dvh items-center justify-center bg-(--background) px-5 py-10 text-(--foreground)"
>
	<div
		class="flex w-full max-w-md flex-col gap-6 rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) px-6 py-8 text-center"
	>
		{#if data.step === 'login'}
			<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
				An app wants to edit this website. Log in as admin to review the request.
			</p>
			<AuthDialog onlogin_success={invalidateAll} />
		{:else if data.step === 'consent'}
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">Allow {data.client_name} to edit {data.site_host}?</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					It can read, create, and edit pages for the next 48 hours. Logging out ends its access
					right away.
				</p>
			</div>
			<p class="m-0 text-sm leading-6">
				Access is sent to <strong class="font-medium">{data.redirect_host}</strong>
			</p>
			{#if data.on_this_computer}
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					This is an app on this computer. Only allow it if you just started connecting it yourself.
				</p>
			{/if}
			<form method="POST" class="flex flex-wrap items-center justify-center gap-3">
				<button
					type="submit"
					name="decision"
					value="deny"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-5 text-sm leading-5 whitespace-nowrap text-(--foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40 sm:h-11.5"
					>Deny</button
				>
				<button
					type="submit"
					name="decision"
					value="allow"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
					>Allow</button
				>
			</form>
		{:else}
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">Can’t connect</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">{data.message}</p>
			</div>
		{/if}

		{#if form?.message}
			<p role="alert" class="m-0 text-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]">
				{form.message}
			</p>
		{/if}
	</div>
</main>
