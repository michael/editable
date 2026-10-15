<script lang="ts">
	import { page } from '$app/state';
	import { is_site_name } from '../../host/site_names.js';
	import { site_taken } from '../../host/host.remote.js';

	let { form } = $props();

	// svelte-ignore state_referenced_locally
	let name = $state(form?.name ?? '');
	let valid = $derived(is_site_name(name));
	let taken = $state(false);

	// Ask the server whether the name is in use, a moment after typing stops.
	$effect(() => {
		const current = name;
		if (!is_site_name(current)) {
			taken = false;
			return;
		}
		const timeout = setTimeout(async () => {
			const result = await site_taken(current);
			if (current === name) taken = result;
		}, 250);
		return () => clearTimeout(timeout);
	});
</script>

<svelte:head>
	<title>Your Editable site</title>
</svelte:head>

<main
	class="flex min-h-dvh items-center justify-center bg-(--background) px-5 py-10 text-(--foreground)"
>
	<form
		method="POST"
		class="flex w-full max-w-md flex-col gap-6 rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) px-6 py-8 text-center"
	>
		<h1 class="m-0 display-5">Your Editable site</h1>
		<div class="flex flex-col gap-3">
			<label
				class="flex h-9 items-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 transition-[border-color] duration-150 focus-within:border-(--editing) sm:h-11.5"
			>
				<input
					type="text"
					name="name"
					bind:value={name}
					placeholder="you"
					autocomplete="off"
					autocapitalize="off"
					spellcheck="false"
					required
					class="field-sizing-content min-w-0 appearance-none border-0 bg-transparent p-0 text-(--foreground) outline-none placeholder:text-(--muted-foreground) focus:ring-0"
				/>
				<span class="truncate text-(--muted-foreground)">.{page.url.host}</span>
				{#if valid}
					<svg
						class="ml-auto size-5 shrink-0 pl-1 text-[color-mix(in_oklch,green_60%,var(--foreground))]"
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
			<input
				type="password"
				name="password"
				placeholder={taken ? 'Password' : 'Choose a password'}
				autocomplete={taken ? 'current-password' : 'new-password'}
				required
				class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
			/>
		</div>
		<button
			type="submit"
			class="inline-flex h-9 shrink-0 items-center justify-center self-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
		>
			{taken ? 'Log in' : 'Create site'}
		</button>
		{#if form?.message}
			<p role="alert" class="m-0 text-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]">
				{form.message}
			</p>
		{:else if taken}
			<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
				This site exists. If it is yours, log in with its password.
			</p>
		{/if}
	</form>
</main>
