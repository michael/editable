<script module lang="ts">
	/** What a login dialog receives, including one set as system_components.auth_dialog. */
	export type AuthDialogProps = {
		/** Offers editing without logging in; without it the dialog goes straight to login. */
		onedit_for_fun?: () => void;
		/** Call after signing in on this page; it reloads the page as an admin and closes the drawer. */
		onlogin_success?: () => Promise<void> | void;
	};
</script>

<script lang="ts">
	let { onedit_for_fun, onlogin_success = () => {} }: AuthDialogProps = $props();

	let password = $state('');
	let error = $state('');
	let error_timeout_id = $state<ReturnType<typeof setTimeout> | null>(null);
	let pending = $state(false);
	let chosen_step = $state<'choice' | 'login' | null>(null);
	// Without an edit-for-fun option there is no choice to make.
	let step = $derived(chosen_step ?? (onedit_for_fun ? 'choice' : 'login'));
	let password_input_ref = $state<HTMLInputElement>();
	let edit_for_fun_button_ref = $state<HTMLButtonElement>();

	$effect(() => {
		if (step !== 'choice' || !edit_for_fun_button_ref) return;

		requestAnimationFrame(() => {
			edit_for_fun_button_ref?.focus();
		});
	});

	$effect(() => {
		if (step !== 'login' || !password_input_ref) return;

		requestAnimationFrame(() => {
			password_input_ref?.focus();
			password_input_ref?.select();
		});
	});

	function clear_error_timeout() {
		if (error_timeout_id) {
			clearTimeout(error_timeout_id);
			error_timeout_id = null;
		}
	}

	function show_login_error(message: string) {
		clear_error_timeout();
		password = '';
		error = message;

		requestAnimationFrame(() => {
			password_input_ref?.focus();
		});

		error_timeout_id = setTimeout(() => {
			error = '';
			error_timeout_id = null;
		}, 1700);
	}

	function reset_dialog() {
		clear_error_timeout();
		password = '';
		error = '';
		pending = false;
		chosen_step = null;
	}

	function handle_edit_for_fun() {
		reset_dialog();
		onedit_for_fun?.();
	}

	function back_to_choice() {
		if (pending) return;
		reset_dialog();
	}

	function open_login_step() {
		clear_error_timeout();
		chosen_step = 'login';
		error = '';
		password = '';
	}

	async function login_and_edit() {
		if (pending) return;

		pending = true;
		error = '';

		try {
			const api_module = await import('#app/api.remote.js');
			const result = await api_module.log_in({ password });

			if (result && result.ok === false && 'message' in result) {
				show_login_error(result.message || 'Login failed.');
				return;
			}

			reset_dialog();
			await onlogin_success();
		} catch (err) {
			show_login_error(err instanceof Error ? err.message : 'Login failed.');
		} finally {
			pending = false;
		}
	}

	function handle_password_input() {
		clear_error_timeout();
		error = '';
	}

	function handle_login_submit(event: SubmitEvent) {
		event.preventDefault();
		void login_and_edit();
	}
</script>

<div class="mx-auto flex w-full max-w-xl flex-col text-(--foreground)">
	{#if step === 'choice'}
		<div class="flex flex-col gap-6 px-2 py-6 sm:px-1">
			<div class="flex flex-col items-center gap-1 text-center">
				<h2 class="m-0 display-5">You can edit this website</h2>
			</div>

			<div class="flex min-w-0 flex-wrap items-center justify-center gap-3">
				<button
					bind:this={edit_for_fun_button_ref}
					type="button"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
					onclick={handle_edit_for_fun}
				>
					Try out editing
				</button>

				<button
					type="button"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-5 text-sm leading-5 whitespace-nowrap text-(--foreground) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40 sm:h-11.5"
					onclick={open_login_step}>Login as admin</button
				>
			</div>
		</div>
	{:else}
		<div class="mx-auto flex w-full max-w-lg flex-col gap-6 px-1 py-6">
			<div class="flex flex-col items-center gap-1 text-center">
				<h2 class="m-0 display-5">Login as admin</h2>
			</div>

			<form class="flex items-center gap-2" onsubmit={handle_login_submit}>
				<input
					type="text"
					name="username"
					value="admin"
					autocomplete="username"
					class="sr-only"
					tabindex="-1"
					aria-hidden="true"
				/>

				{#if onedit_for_fun}
					<button
						type="button"
						class="inline-flex aspect-square h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) text-sm leading-5 whitespace-nowrap text-(--foreground) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40 sm:h-11.5"
						onclick={back_to_choice}
						title="Back"
						aria-label="Back"
					>
						<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M13.5 6L7.5 12L13.5 18"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</button>
				{/if}

				<input
					type="password"
					autocomplete="current-password"
					bind:this={password_input_ref}
					bind:value={password}
					placeholder={error || 'Enter password'}
					class={`h-9 min-w-0 flex-1 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none sm:h-11.5 ${error ? 'placeholder:text-[color-mix(in_oklch,red_65%,var(--foreground))]' : 'placeholder:text-(--muted-foreground)'} focus:ring-0 focus:outline-none focus-visible:border-(--editing)`}
					oninput={handle_password_input}
				/>

				<button
					type="submit"
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] disabled:cursor-default disabled:opacity-40 sm:h-11.5"
					disabled={pending}
				>
					Login
				</button>
			</form>
		</div>
	{/if}
</div>
