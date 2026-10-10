<script lang="ts">
	import { page } from '$app/state';

	let { data, form } = $props();

	// Post to the same URL so the OAuth parameters stay with every action.
	function action_url(name: string) {
		const params = new URLSearchParams(
			[...page.url.searchParams].filter(([key]) => !key.startsWith('/'))
		).toString();
		return `?${params}${params ? '&' : ''}/${name}`;
	}

	// Button recipes from AuthDialog, in the site's accent colors.
	const TW_BTN_BASE =
		'inline-flex h-9 sm:h-[46px] shrink-0 items-center justify-center rounded-(--button-border-radius) px-5 text-sm leading-5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer';
	const TW_PRIMARY_BTN = `${TW_BTN_BASE} border border-transparent bg-(--accent) text-(--accent-foreground) enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]`;
	const TW_SECONDARY_BTN = `${TW_BTN_BASE} border border-(--stroke) bg-(--background) text-(--foreground) enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10`;
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
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">Connect an app</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					An app wants to edit this website. Log in as admin to review the request.
				</p>
			</div>
			<form method="POST" action={action_url('login')} class="flex items-center gap-2">
				<input
					type="text"
					name="username"
					value="admin"
					autocomplete="username"
					class="sr-only"
					tabindex="-1"
					aria-hidden="true"
				/>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					placeholder="Admin password"
					required
					class="h-9 min-w-0 flex-1 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) outline-none placeholder:text-(--muted-foreground) focus-visible:border-(--editing) sm:h-[46px]"
				/>
				<button type="submit" class={TW_PRIMARY_BTN}>Log in</button>
			</form>
		{:else if data.step === 'consent'}
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">Allow {data.client_name} to edit this website?</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					It can read, create, and edit pages for the next 48 hours. Logging out ends its access
					right away.
				</p>
			</div>
			<p class="m-0 text-sm leading-6">
				Access is sent to <strong class="font-medium">{data.redirect_host}</strong>
				{#if data.client_domain}
					<br />App details published by <strong class="font-medium">{data.client_domain}</strong>
				{/if}
			</p>
			{#if data.on_this_computer}
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					This is an app on this computer. Only allow it if you just started connecting it yourself.
				</p>
			{/if}
			<div class="flex flex-wrap items-center justify-center gap-3">
				<form method="POST" action={action_url('deny')}>
					<button type="submit" class={TW_SECONDARY_BTN}>Deny</button>
				</form>
				<form method="POST" action={action_url('approve')}>
					<button type="submit" class={TW_PRIMARY_BTN}>Allow</button>
				</form>
			</div>
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
