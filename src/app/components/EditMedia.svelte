<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { serialize_path } from 'svedit';

	const svedit = get_svedit_context();

	let { path }: { path: DocumentPath } = $props();

	let edit_media_command = $derived(svedit.session.commands?.edit_image);
	let target_node = $derived(svedit.session.get(path));
	let alt_input_value = $state('');
	let alt_input_ref = $state<HTMLTextAreaElement>();
	let dialog_ref = $state<HTMLDialogElement>();

	function save() {
		if (target_node?.type === 'image' || target_node?.type === 'video') {
			const tr = svedit.session.tr;
			tr.set([target_node.id, 'alt'], alt_input_value);
			svedit.session.apply(tr);
		}
		close();
	}

	function close() {
		if (edit_media_command) {
			edit_media_command.show_prompt = false;
		}
		svedit.focus_canvas();
	}

	function handle_keydown(event) {
		event.stopPropagation();

		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			save();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			close();
		}
	}

	function handle_backdrop_click(event) {
		if (event.target === dialog_ref) {
			close();
		}
	}

	$effect(() => {
		if (edit_media_command?.show_prompt && dialog_ref) {
			alt_input_value = target_node?.alt || '';
			if (!dialog_ref.open) {
				dialog_ref.showModal();
			}

			if (alt_input_ref) {
				alt_input_ref.focus();
				alt_input_ref.select();
			}
		} else if (dialog_ref?.open) {
			dialog_ref.close();
		}
	});
</script>

<dialog
	bind:this={dialog_ref}
	class="edit-media-dialog absolute z-40 m-0 mt-1 max-h-90 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	style="position-anchor: --{serialize_path(
		path
	)}; position-area: block-end span-all; justify-self: anchor-center;"
	onclick={handle_backdrop_click}
>
	<div class="flex flex-col gap-1">
		<div class="px-3 pt-2 pb-1">
			<div class="text-sm font-medium">Alt text</div>
		</div>
		<div class="min-w-0">
			<textarea
				bind:this={alt_input_ref}
				bind:value={alt_input_value}
				rows="3"
				placeholder="Describe the media for people using screen readers."
				class="edit-media-textarea block w-72 max-w-full min-w-0 resize-none rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border border-(--stroke) bg-(--background) px-3 py-2 text-base leading-6 text-(--foreground) outline-none focus:border-(--editing) focus:ring-0"
				onkeydown={handle_keydown}
			></textarea>
		</div>
		<div class="flex items-center justify-end">
			<button
				type="button"
				class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium text-(--editing) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--editing-muted) enabled:active:bg-(--editing)/15 disabled:cursor-default disabled:opacity-40"
				onclick={save}
			>
				Update
			</button>
		</div>
	</div>
</dialog>

<style>
	.edit-media-dialog::backdrop {
		background: color-mix(in oklch, var(--foreground) 10%, transparent);
	}
</style>
