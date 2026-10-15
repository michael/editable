<script lang="ts">
	import { page } from '$app/state';

	let { form } = $props();
</script>

<svelte:head>
	<title>Create your site</title>
</svelte:head>

<main
	class="flex min-h-dvh items-center justify-center bg-(--background) px-5 py-10 text-(--foreground)"
>
	<form
		method="POST"
		class="flex w-full max-w-md flex-col gap-6 rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) px-6 py-8 text-center"
	>
		<div class="flex flex-col gap-2">
			<h1 class="m-0 display-5">Create your site</h1>
			<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
				Pick a name and a password. Your site opens right away at
				<strong class="font-medium">{page.url.host}/your-name</strong>, and the password lets you
				edit it from there.
			</p>
		</div>
		<div class="flex flex-col gap-3">
			<input
				type="text"
				name="name"
				value={form?.name ?? ''}
				placeholder="Site name"
				autocomplete="username"
				required
				class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
			/>
			<input
				type="password"
				name="password"
				placeholder="Password"
				autocomplete="new-password"
				required
				class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
			/>
		</div>
		{#if form?.message}
			<p role="alert" class="m-0 text-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]">
				{form.message}
			</p>
		{/if}
		<button
			type="submit"
			class="inline-flex h-9 shrink-0 items-center justify-center self-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
			>Create site</button
		>
		<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
			Already have a site? Open it and log in from its edit button.
		</p>
	</form>
</main>
