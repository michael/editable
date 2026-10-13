<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import AuthDialog from '#app/components/AuthDialog.svelte';
	import { TW_PRIMARY_BTN, TW_SECONDARY_BTN } from '#app/buttons.js';

	let { data, form } = $props();
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
				{#if data.client_domain}
					<br />App details published by <strong class="font-medium">{data.client_domain}</strong>
				{/if}
			</p>
			{#if data.on_this_computer}
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					This is an app on this computer. Only allow it if you just started connecting it yourself.
				</p>
			{/if}
			<form method="POST" class="flex flex-wrap items-center justify-center gap-3">
				<button type="submit" name="decision" value="deny" class={TW_SECONDARY_BTN}>Deny</button>
				<button type="submit" name="decision" value="allow" class={TW_PRIMARY_BTN}>Allow</button>
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
