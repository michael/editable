<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';
	import type { AuthDialogProps } from './AuthDialog.svelte';

	let { onlogin_success = () => {} }: AuthDialogProps = $props();

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let pending = $state(false);

	// Signed in to the app, but not as an editor of the website.
	let reader = $derived(page.data.user && !page.data.is_editor ? page.data.user : null);

	async function log_in(event: SubmitEvent) {
		event.preventDefault();
		if (pending) return;
		pending = true;
		error = '';
		try {
			const { login_admin } = await import('#app/api.remote.js');
			const result = await login_admin({ username, password });
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

	async function log_out() {
		const { logout_admin } = await import('#app/api.remote.js');
		await logout_admin();
		await invalidateAll();
	}
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-6 px-1 py-6 text-(--foreground)">
	{#if reader}
		<div class="flex flex-col items-center gap-2 text-center">
			<h2 class="m-0 display-5">Signed in as {reader.name}</h2>
			<p class="m-0 body-sm text-(--muted-foreground)">
				Your account can report meter readings, but it can't edit this website.
			</p>
		</div>
		<div class="flex flex-wrap items-center justify-center gap-3">
			<a
				href={resolve_href('/meter-readings', site)}
				class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] sm:h-11.5"
			>
				Report a reading
			</a>
			<button
				type="button"
				class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-5 text-sm leading-5 whitespace-nowrap text-(--foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 sm:h-11.5"
				onclick={log_out}
			>
				Log out
			</button>
		</div>
	{:else}
		<div class="flex flex-col items-center gap-1 text-center">
			<h2 class="m-0 display-5">Log in</h2>
			{#if error}
				<p class="m-0 body-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]" role="alert">
					{error}
				</p>
			{/if}
		</div>
		<form class="flex flex-col gap-2" onsubmit={log_in}>
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
	{/if}
</div>
