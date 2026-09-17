<script lang="ts">
	import { goto, refreshAll } from '$app/navigation';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';
	import { get_page_delete_dialog } from '#app/page_delete_dialog_context.svelte.js';

	const page_browser = get_page_browser();
	const page_delete_dialog = get_page_delete_dialog();

	let dialog_ref = $state(null);
	let confirm_button_ref = $state(null);
	let delete_error = $state('');
	let deleting = $state(false);

	let target = $derived(page_delete_dialog.state.target);

	// Clear a previous failure whenever a new target is opened.
	$effect(() => {
		page_delete_dialog.state.target;
		delete_error = '';
	});

	$effect(() => {
		if (target && dialog_ref && !dialog_ref.open) {
			dialog_ref.showModal();
			// showModal() lands on the first focusable element, which is Cancel. Move
			// focus to Delete so Enter confirms; Escape still closes via oncancel, and
			// tabbing to Cancel keeps its own Enter behavior.
			requestAnimationFrame(() => {
				confirm_button_ref?.focus();
			});
		} else if (!target && dialog_ref?.open) {
			dialog_ref.close();
		}
	});

	function close() {
		page_delete_dialog.close();
	}

	function handle_click(event) {
		if (event.target === dialog_ref) {
			close();
		}
	}

	function handle_cancel(event) {
		event.preventDefault();
		close();
	}

	function get_confirmation_message() {
		if (!target) return '';
		return `Delete “${target.title}”? This cannot be undone.`;
	}

	async function confirm_delete() {
		const current = page_delete_dialog.state.target;
		if (!current) return;

		deleting = true;
		delete_error = '';

		try {
			const api_module = await import('#app/api.remote.js');
			await api_module.delete_page({ document_id: current.document_id });

			current.on_deleted?.();
			close();

			if (current.is_current_page) {
				// The page we are looking at is gone, so leave before refreshing.
				page_browser.close?.();
				await goto('/');
			} else {
				page_browser.invalidate?.();
				await refreshAll();
			}
		} catch (err) {
			delete_error = err instanceof Error ? err.message : 'Failed to delete page.';
		} finally {
			deleting = false;
		}
	}
</script>

<dialog
	bind:this={dialog_ref}
	class="confirm-dialog focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	oncancel={handle_cancel}
	onclick={handle_click}
>
	{#if target}
		<form
			class="confirm-panel"
			onsubmit={(event) => {
				event.preventDefault();
				void confirm_delete();
			}}
		>
			<h3 class="confirm-title">Delete page</h3>
			<p class="confirm-message">{get_confirmation_message()}</p>
			{#if delete_error}
				<p class="confirm-error" role="alert">{delete_error}</p>
			{/if}
			<div class="confirm-actions">
				<button
					type="button"
					class="confirm-btn inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					onclick={close}
					disabled={deleting}
				>
					Cancel
				</button>
				<button
					bind:this={confirm_button_ref}
					type="submit"
					class="confirm-btn confirm-btn-danger inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					disabled={deleting}
				>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</form>
	{/if}
</dialog>

<style>
	.confirm-dialog {
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;
		max-width: none;
		max-height: none;
		width: 100vw;
		height: 100vh;
		overflow: visible;
	}

	.confirm-dialog::backdrop {
		background: color-mix(in oklch, var(--foreground) 10%, transparent);
	}

	.confirm-panel {
		position: fixed;
		inset: 50% auto auto 50%;
		transform: translate(-50%, -50%);
		width: min(28rem, calc(100vw - 2.5rem));
		max-height: calc(100dvh - 2.5rem);
		overflow-y: auto;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border: 1px solid var(--stroke);
		border-radius: min(1rem, var(--button-border-radius));
		background: var(--background);
		color: var(--foreground);
		box-shadow: none;
	}

	.confirm-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 500;
	}

	.confirm-message {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5rem;
		color: var(--muted-foreground);
	}

	.confirm-error {
		margin: 0;
		font-size: 0.88rem;
		color: color-mix(in oklch, red 65%, var(--foreground));
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.confirm-btn-danger {
		color: color-mix(in oklch, red 65%, var(--foreground));
		border-color: color-mix(in oklch, red 35%, var(--foreground) 12%, transparent);
	}
</style>
