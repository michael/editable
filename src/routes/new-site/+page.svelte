<script lang="ts">
	import { page } from '$app/state';
	import { is_site_name } from '../../host/site_names.js';

	let { form } = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? '');
	let valid = $derived(is_site_name(name));
	let step = $derived(form?.exists === undefined ? 'name' : form.exists ? 'login' : 'create');
</script>

<svelte:head>
	<title>Your site</title>
</svelte:head>

<main
	class="flex min-h-dvh items-center justify-center bg-(--background) px-5 py-10 text-(--foreground)"
>
	<form
		method="POST"
		class="flex w-full max-w-md flex-col gap-6 rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) px-6 py-8 text-center"
	>
		{#if step === 'name'}
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">Choose a site name</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					Your site lives at this address. Already have one? Enter its name to log in.
				</p>
			</div>
			<label
				class="flex h-9 items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 transition-[border-color] duration-150 focus-within:border-(--editing) sm:h-11.5"
			>
				<input
					type="text"
					name="name"
					bind:value={name}
					placeholder="name"
					autocomplete="username"
					autocapitalize="off"
					spellcheck="false"
					required
					class="field-sizing-content min-w-12 appearance-none border-0 bg-transparent p-0 text-(--foreground) outline-none placeholder:text-(--muted-foreground) focus:ring-0"
				/>
				<span class="truncate text-(--muted-foreground)">.{page.url.host}</span>
				{#if valid}
					<svg
						class="ml-auto size-5 shrink-0 text-[color-mix(in_oklch,green_60%,var(--foreground))]"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M5 12.5L10 17.5L19 7"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				{/if}
			</label>
		{:else}
			<div class="flex flex-col gap-2">
				<h1 class="m-0 display-5">{step === 'login' ? 'Welcome back' : 'Pick a password'}</h1>
				<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
					{step === 'login' ? 'Enter the password for' : 'You need it to edit'}
					<strong class="font-medium text-(--foreground)">{name}.{page.url.host}</strong>
					<br /><a href="/new-site" class="underline">Change the name</a>
				</p>
			</div>
			<input type="hidden" name="name" value={name} />
			<input
				type="password"
				name="password"
				placeholder="Password"
				autocomplete={step === 'login' ? 'current-password' : 'new-password'}
				required
				class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
			/>
		{/if}
		{#if form?.message}
			<p role="alert" class="m-0 text-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]">
				{form.message}
			</p>
		{/if}
		<button
			type="submit"
			class="inline-flex h-9 shrink-0 items-center justify-center self-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
		>
			{step === 'name' ? 'Continue' : step === 'login' ? 'Log in' : 'Create site'}
		</button>
	</form>
</main>
