<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import { get_app_context } from '#app/app_context.js';
	import { MEDIA_DEFAULTS } from '#app/document_schema.js';
	import type { InternalLinkPreview } from '#app/api.remote.js';
	import type { DocumentNode, DocumentPath, Transaction } from 'svedit';
	import { serialize_path } from 'svedit';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';

	const svedit = get_svedit_context();
	const app = get_app_context();
	const page_browser = get_page_browser();

	let { path }: { path?: DocumentPath } = $props();

	let edit_link_command = $derived(svedit.session.commands?.edit_link);
	let toggle_link_command = $derived(svedit.session.commands?.toggle_link);
	let is_creating = $derived(toggle_link_command?.show_prompt === true);
	let is_open = $derived(
		edit_link_command?.show_prompt === true || toggle_link_command?.show_prompt === true
	);
	let anchor_name = $derived(path ? `--${serialize_path(path)}` : '--selection-highlight');
	let target_node = $derived(get_target_node());
	let is_new_link = $derived(is_creating || !target_node?.href);

	function get_target_node() {
		const selected_node = svedit.session.selected_node;
		if (selected_node && 'href' in selected_node) return selected_node;

		const active_link = svedit.session.active_mark;
		if (active_link?.node.type === 'link') return active_link.node;

		return null;
	}
	let href_input_value = $state('');
	let open_in_new_tab = $state(false);
	let href_input_ref = $state<HTMLInputElement>();
	let dialog_ref = $state<HTMLDialogElement>();

	function is_internal_page_link(href: string) {
		return href.startsWith('/') && !href.startsWith('//');
	}

	function get_link_target() {
		return open_in_new_tab ? '_blank' : '_self';
	}

	async function get_page_preview(
		selected_page?: InternalLinkPreview
	): Promise<InternalLinkPreview | null> {
		if (selected_page) return selected_page;
		if (!app.has_backend || !is_internal_page_link(href_input_value)) return null;

		try {
			const api_module = await import('#app/api.remote.js');
			return await api_module.get_internal_link_preview(href_input_value);
		} catch {
			return null;
		}
	}

	function fill_empty_preview_properties(
		tr: Transaction,
		node: DocumentNode,
		page_preview: InternalLinkPreview
	) {
		const text_values = [
			['title', page_preview.title],
			['description', page_preview.description]
		] as const;

		for (const [property_name, content] of text_values) {
			if (tr.schema[node.type]?.properties[property_name]?.type !== 'text') continue;
			if (typeof content !== 'string' || !content.trim()) continue;
			if (tr.get([node.id, property_name])?.content?.trim()) continue;

			tr.set([node.id, property_name], { content, marks: [], annotations: [] });
		}

		const media_property = tr.schema[node.type]?.properties.media;
		const preview_media = page_preview.preview_media_node;
		if (media_property?.type !== 'node' || !preview_media) return;
		if (tr.get([node.id, 'media'])?.src) return;

		const media_node = {
			...MEDIA_DEFAULTS,
			...preview_media,
			id: tr.generate_id(),
			type: media_property.node_types?.includes(preview_media.type) ? preview_media.type : 'image',
			mime_type: preview_media.mime_type ?? '',
			object_fit: 'cover'
		};
		tr.create(media_node);
		tr.set([node.id, 'media'], media_node.id);
	}

	async function save(selected_page?: InternalLinkPreview) {
		const node_to_update =
			!is_creating && target_node && 'href' in target_node ? target_node : null;
		const page_preview =
			node_to_update && node_to_update.href !== href_input_value
				? await get_page_preview(selected_page)
				: null;

		if (is_creating) {
			if (href_input_value) {
				svedit.session.apply(
					svedit.session.tr.toggle_mark('link', {
						href: href_input_value,
						target: get_link_target()
					})
				);
			}
		} else if (node_to_update) {
			const tr = svedit.session.tr;
			tr.set([node_to_update.id, 'href'], href_input_value);
			tr.set([node_to_update.id, 'target'], get_link_target());
			if (page_preview) fill_empty_preview_properties(tr, node_to_update, page_preview);
			svedit.session.apply(tr);
		}
		close();
	}

	function close() {
		if (edit_link_command) {
			edit_link_command.show_prompt = false;
		}
		if (toggle_link_command) {
			toggle_link_command.show_prompt = false;
		}
		svedit.focus_canvas();
	}

	function handle_keydown(event) {
		event.stopPropagation();

		if (event.key === 'Enter') {
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
		if (is_open && dialog_ref) {
			const initial_href = is_creating ? 'https://' : target_node?.href || '';
			href_input_value = initial_href;
			open_in_new_tab = !is_creating && target_node?.target === '_blank';

			if (!dialog_ref.open) {
				dialog_ref.showModal();
			}

			if (href_input_ref) {
				href_input_ref.focus();
				href_input_ref.select();
			}
		} else if (dialog_ref?.open) {
			dialog_ref.close();
		}
	});
</script>

<dialog
	bind:this={dialog_ref}
	class="edit-link-dialog absolute z-40 m-0 mt-3 max-h-90 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground) focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	style="position-anchor: {anchor_name}; position-area: block-end span-all; justify-self: anchor-center;"
	onclick={handle_backdrop_click}
>
	<div class="flex flex-col gap-1">
		<div class="min-w-0">
			<div class="flex min-w-0 items-center gap-1">
				<input
					id="edit-link-url-input"
					bind:this={href_input_ref}
					type="url"
					bind:value={href_input_value}
					placeholder="https://example.com"
					class="edit-link-input min-h-9 w-72 min-w-0 flex-1 rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border border-(--stroke) bg-(--background) px-3 py-1 text-base leading-6 text-(--foreground) outline-none focus:border-(--editing) focus:ring-0"
					onkeydown={handle_keydown}
				/>
				{#if app.has_backend && app.is_admin}
					<button
						type="button"
						class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						title="Select page"
						aria-label="Select page"
						onclick={() => {
							page_browser.open_select((page) => {
								href_input_value = page.page_href || '/';
								open_in_new_tab = false;
								void save(page);
							});
						}}
					>
						<svg
							class="size-6"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<rect x="4.5" y="4.5" width="6" height="6" rx="1" stroke="currentColor" />
							<rect x="13.5" y="4.5" width="6" height="6" rx="1" stroke="currentColor" />
							<rect x="4.5" y="13.5" width="6" height="6" rx="1" stroke="currentColor" />
							<rect x="13.5" y="13.5" width="6" height="6" rx="1" stroke="currentColor" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-2 pl-3">
			<label class="flex min-h-9 cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					bind:checked={open_in_new_tab}
					class="size-4 shrink-0 cursor-pointer rounded-[min(0.25rem,var(--button-border-radius))] border-(--stroke)! bg-(--muted)! text-(--editing) ring-0 checked:border-transparent! checked:bg-(--editing)! focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
				/>
				<span class="text-sm text-(--foreground)">Open in new tab</span>
			</label>
			<button
				type="button"
				class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium text-(--editing) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--editing-muted) enabled:active:bg-(--editing)/15 disabled:cursor-default disabled:opacity-40"
				onclick={() => void save()}
			>
				{is_new_link ? 'Create' : 'Update'}
			</button>
		</div>
	</div>
</dialog>

<style>
	.edit-link-dialog::backdrop {
		background: color-mix(in oklch, var(--foreground) 10%, transparent);
	}
</style>
