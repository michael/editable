<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import { get_app_context } from '#app/app_context.js';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';
	import { get_page_url_dialog } from '#app/page_url_dialog_context.svelte.js';

	const app = get_app_context();
	const page_browser = get_page_browser();
	const page_url_dialog = get_page_url_dialog();

	let dialog_ref = $state(null);
	let page_url_value = $state('');
	let page_url_error = $state('');
	let saving = $state(false);

	let target = $derived(page_url_dialog.state.target);

	// Prefill whenever a new target is opened, keyed on the target itself so
	// reopening the same page resets an abandoned edit.
	$effect(() => {
		const current = page_url_dialog.state.target;
		page_url_value = current?.page_href ? current.page_href.replace(/^\//, '') : '';
		page_url_error = '';
	});

	$effect(() => {
		if (target && dialog_ref && !dialog_ref.open) {
			dialog_ref.showModal();
		} else if (!target && dialog_ref?.open) {
			dialog_ref.close();
		}
	});

	function close() {
		page_url_dialog.close();
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

	async function save() {
		const current = page_url_dialog.state.target;
		if (!current) return;

		saving = true;
		page_url_error = '';

		try {
			const api_module = await import('#app/api.remote.js');
			const result = await api_module.update_page_slug({
				document_id: current.document_id,
				slug: page_url_value
			});

			if (result && result.ok === false && 'code' in result && 'message' in result) {
				page_url_error = result.message || 'Failed to update Page URL.';
				return;
			}

			current.on_saved?.();
			close();
			page_browser.invalidate?.();
			await refreshAll();
		} catch (err) {
			page_url_error = err instanceof Error ? err.message : 'Failed to update Page URL.';
		} finally {
			saving = false;
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
				void save();
			}}
		>
			<h3 class="confirm-title">Edit URL</h3>
			<div class="page-url-field">
				<span class="page-url-prefix">{app.origin || 'example.com'}/</span>
				<input
					type="text"
					bind:value={page_url_value}
					class="page-url-input min-h-9 min-w-0 flex-1 rounded-[min(0.75rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) px-3 py-1 text-base leading-6 text-(--foreground) outline-none focus:border-(--editing) focus:ring-0"
					aria-label="Page URL"
					placeholder="your-page-url"
				/>
			</div>
			{#if page_url_error}
				<p class="confirm-error" role="alert">{page_url_error}</p>
			{/if}
			<div class="confirm-actions">
				<button
					type="button"
					class="confirm-btn inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					onclick={close}
					disabled={saving}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="confirm-btn inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					disabled={saving}
				>
					{saving ? 'Saving…' : 'Save'}
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

	.page-url-field {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.page-url-prefix {
		font-size: 0.875rem;
		color: var(--muted-foreground);
		overflow-wrap: anywhere;
	}
</style>
