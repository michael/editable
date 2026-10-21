<script lang="ts">
	import type { AuthDialogProps } from './AuthDialog.svelte';

	let { onlogin_success = () => {} }: AuthDialogProps = $props();

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let pending = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		error = '';
		try {
			const { log_in } = await import('#app/api.remote.js');
			const result = await log_in({ username, password });
			if ('message' in result) {
				error = result.message;
				password = '';
				return;
			}
			await onlogin_success();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed.';
		} finally {
			pending = false;
		}
	}
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-6 px-1 py-6 text-(--foreground)">
	<div class="flex flex-col items-center gap-1 text-center">
		<h2 class="m-0 display-5">Log in</h2>
		{#if error}
			<p class="m-0 body-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]" role="alert">
				{error}
			</p>
		{/if}
	</div>
	<form class="flex flex-col gap-2" onsubmit={submit}>
		<input
			type="text"
			autocomplete="username"
			bind:value={username}
			placeholder="Username"
			aria-label="Username"
			class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
		/>
		<input
			type="password"
			autocomplete="current-password"
			bind:value={password}
			placeholder="Password"
			aria-label="Password"
			class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
		/>
		<button
			type="submit"
			class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
			disabled={pending || !username || !password}
		>
			Log in
		</button>
	</form>
</div>
