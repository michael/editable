<script lang="ts">
	import { TW_PRIMARY_BTN, TW_SECONDARY_BTN } from '#app/buttons.js';

	let {
		open = false,
		onreload,
		onoverwrite,
		onclose
	}: {
		open?: boolean;
		onreload: () => void;
		onoverwrite: () => void;
		onclose: () => void;
	} = $props();

	let dialog_ref = $state<HTMLDialogElement>();

	$effect(() => {
		if (open && dialog_ref && !dialog_ref.open) dialog_ref.showModal();
		else if (!open && dialog_ref?.open) dialog_ref.close();
	});

	// Escape and backdrop clicks close the dialog and keep the local edits.
	function handle_cancel(event: Event) {
		event.preventDefault();
		onclose();
	}

	function handle_click(event: MouseEvent) {
		if (event.target === dialog_ref) onclose();
	}
</script>

<dialog
	bind:this={dialog_ref}
	class="m-0 h-screen max-h-none w-screen max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-(--foreground)/10 focus-visible:outline-none"
	aria-labelledby="ew-save-conflict-title"
	aria-describedby="ew-save-conflict-message"
	oncancel={handle_cancel}
	onclick={handle_click}
>
	{#if open}
		<div
			class="fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2.5rem)] w-[min(32rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-6 overflow-y-auto rounded-[min(1.5rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) px-6 py-8 text-center text-(--foreground)"
		>
			<div class="flex flex-col gap-2">
				<h2 id="ew-save-conflict-title" class="m-0 display-5">
					Which version do you want to keep?
				</h2>
				<p id="ew-save-conflict-message" class="m-0 text-sm leading-6 text-(--muted-foreground)">
					Someone else saved changes to this page while you were editing. The version you don’t
					choose will be lost.
				</p>
			</div>
			<div class="flex flex-wrap items-center justify-center gap-3">
				<button type="button" class={TW_SECONDARY_BTN} onclick={onreload}>Use their version</button>
				<button type="button" class={TW_PRIMARY_BTN} onclick={onoverwrite}>Save my version</button>
			</div>
		</div>
	{/if}
</dialog>
