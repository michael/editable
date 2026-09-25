<script lang="ts">
	import { get_app_context } from '#app/app_context.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';
	import { get_page_delete_dialog } from '#app/page_delete_dialog_context.svelte.js';
	import { extract_page_metadata } from '#app/page_metadata.js';
	import { onMount, untrack } from 'svelte';
	import { get_selection_node_ancestors } from '#app/app_utils.js';
	import NodeNavigator from './NodeNavigator.svelte';
	import { tooltip } from '#app/tooltip.js';

	let { session, app_commands, editable, focus_canvas } = $props();

	const page_browser = get_page_browser();
	const app = get_app_context();
	const page_delete_dialog = get_page_delete_dialog();

	let page_menu = $state<HTMLDivElement>();
	let page_menu_trigger = $state<HTMLButtonElement>();
	let page_menu_open = $state(false);
	let is_mac = $state(true);

	export function open_page_menu() {
		page_menu?.showPopover();
		page_menu?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
	}

	export function close_page_menu() {
		page_menu?.hidePopover();
	}

	function handle_page_menu_toggle(event: ToggleEvent) {
		page_menu_open = event.newState === 'open';
		if (page_menu_open) {
			page_menu?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
		}
	}

	function handle_page_menu_keydown(event: KeyboardEvent) {
		if (event.key === 'Escape' || event.key === 'Tab') {
			if (event.key === 'Escape') event.preventDefault();
			event.stopPropagation();
			page_menu?.hidePopover();
			page_menu_trigger?.focus();
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const items = Array.from(
			page_menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []
		);
		if (!items.length) return;
		const index = items.findIndex((item) => item === document.activeElement);
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? items.length - 1
					: (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
		items[next].focus();
	}

	onMount(() => {
		is_mac = /Mac|iPhone|iPad/.test(navigator.platform);
	});

	let cancel_command = $derived(app_commands.cancel_editing ?? null);
	let cancel_button_label = $derived(cancel_command?.label || 'Cancel');
	let can_browse_pages = $derived(app.has_backend && app.is_admin && !editable);
	let can_create_pages = $derived(app.has_backend && app.is_admin);
	let can_manage_current_page = $derived(app.has_backend && app.is_admin && app.can_edit);
	let can_logout = $derived(app.has_backend && app.is_admin && !editable);
	let can_edit_document = $derived(
		(app.is_demo_mode || !app.has_backend || app.is_admin) && !app_commands.edit_document.disabled
	);
	let can_show_read_toolbar = $derived(
		can_create_pages ||
			can_browse_pages ||
			can_edit_document ||
			can_manage_current_page ||
			can_logout
	);

	// Home is served from `/` and has no editable slug.
	let is_home_page = $derived(page.url.pathname === '/');

	function open_page_delete_dialog() {
		if (is_home_page) return;
		// On demand, not reactive: to_json() serializes the whole document.
		const metadata = extract_page_metadata(session.to_json());
		page_delete_dialog.open({
			document_id: session.doc.document_id,
			title: metadata.title || 'Untitled page',
			is_current_page: true
		});
	}

	let selected_property = $derived(
		session.selection?.type === 'property' ? session.get(session.selection.path) : null
	);
	let is_media_selected = $derived(
		selected_property?.type === 'image' || selected_property?.type === 'video'
	);
	let is_node_caret = $derived(
		session.selection?.type === 'node' &&
			session.selection.anchor_offset === session.selection.focus_offset
	);

	let can_select_parent = $derived(
		!!session.commands.select_parent && !session.commands.select_parent.disabled
	);
	let can_show_variant_selector = $derived(
		app.allow_structural_changes && get_selection_node_ancestors(session).length > 0
	);
	let can_show_selection_tool_group = $derived(can_select_parent || can_show_variant_selector);

	// Hidden in CSS on narrow screens; derived here so the breakpoint stays in one place.
	let is_single_node_selected = $derived(
		session.selection?.type === 'node' &&
			Math.abs(session.selection.anchor_offset - session.selection.focus_offset) === 1
	);

	let file_input_ref = $state(null);

	// How far the virtual keyboard overlaps the layout viewport. 0 on browsers that
	// resize it themselves (interactive-widget in app.html).
	let keyboard_inset = $state(0);

	$effect(() => {
		const visual_viewport = window.visualViewport;
		if (!visual_viewport) return;

		let current = untrack(() => keyboard_inset);
		let target = current;
		let raf = 0;

		function measure() {
			target = Math.max(
				0,
				Math.round(window.innerHeight - visual_viewport.height - visual_viewport.offsetTop)
			);
			if (!raf) raf = requestAnimationFrame(follow);
		}

		// Exponential follower: smooths the keyboard jump, damps touch-pan noise.
		function follow() {
			raf = 0;
			const delta = target - current;
			if (Math.abs(delta) <= 1) {
				current = target;
			} else {
				current += delta * 0.35;
				raf = requestAnimationFrame(follow);
			}
			keyboard_inset = current;
		}

		measure();
		visual_viewport.addEventListener('resize', measure);
		visual_viewport.addEventListener('scroll', measure);

		return () => {
			cancelAnimationFrame(raf);
			visual_viewport.removeEventListener('resize', measure);
			visual_viewport.removeEventListener('scroll', measure);
		};
	});

	function handle_insert_default_node_click(event) {
		handle_btn_click(event, session.commands.insert_default_node);
	}

	function handle_delete_selection_click(event) {
		if (!app.allow_structural_changes) return;
		session.apply(session.tr.delete_selection('backward'));
		restore_canvas_focus(event);
	}

	function cache_replace_media_path(path) {
		document.documentElement.dataset.replaceMediaPath = JSON.stringify(path);
	}

	function handle_edit_image_click(event) {
		handle_btn_click(event, session.commands.edit_image);
	}

	function handle_edit_document_click() {
		if (app.is_demo_mode && app.has_backend && !app.is_admin) {
			app.edit_for_fun();
			return;
		}
		app_commands.edit_document.execute();
	}

	function handle_replace_image_click() {
		if (session.selection?.type !== 'property') return;
		cache_replace_media_path(session.selection.path);
		// Opens a file dialog, so focus intentionally leaves the canvas here.
		file_input_ref?.click();
	}

	async function handle_file_selected(e) {
		const file = e.target.files?.[0];
		const cached_path = document.documentElement.dataset.replaceMediaPath;
		const path = cached_path ? JSON.parse(cached_path) : null;
		if (!file || !path) return;

		// HACK: Android produces broken blob urls on the original file object,
		// turning it into a blob first, fixes this. On the downside, this will use
		// up more memory temporarily.
		const normalized_blob = new Blob([await file.arrayBuffer()], { type: file.type });
		const blob_url = URL.createObjectURL(normalized_blob);

		await session.config.replace_media(session, path, normalized_blob, blob_url);
		delete document.documentElement.dataset.replaceMediaPath;
		// Reset so the same file can be re-selected
		e.target.value = '';
	}

	const tw_toolbar_position =
		'bottom-[max(1rem,env(safe-area-inset-bottom,0px))] left-5 right-5 sm:left-7 sm:right-7 md:left-10 md:right-10 lg:left-14 lg:right-14';
	const tw_toolbar_surface =
		'pointer-events-auto min-w-0 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)';

	const tw_toolbar_btn =
		'pointer-events-auto inline-flex size-9 flex-none items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)';
	const tw_toolbar_btn_disabled = 'cursor-default opacity-40';
	const tw_toolbar_btn_hover = 'cursor-pointer hover:bg-(--muted) active:bg-(--foreground)/10';
	const tw_page_actions_item =
		'flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal whitespace-nowrap text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11';

	// preventDefault keeps focus and selection in the canvas; the command runs on
	// click, which fires for both mouse and keyboard.
	function handle_btn_mousedown(event) {
		event.preventDefault();
	}

	// Keyboard-activated clicks report no button presses.
	function is_keyboard_activation(event) {
		return event.detail === 0;
	}

	// Keyboard activation leaves focus on the toolbar, where the canvas stops
	// re-rendering and scrolling its selection.
	function restore_canvas_focus(event) {
		if (is_keyboard_activation(event)) focus_canvas();
	}

	// These open a popover anchored to the selection highlight, which focus_canvas()
	// removes. Checked structurally: EditLinkCommand sets show_prompt on a timeout,
	// so it is still false right after execute().
	function opens_anchored_prompt(command) {
		return !!command && 'show_prompt' in command;
	}

	function handle_btn_click(event, command) {
		if (command?.disabled) return;
		command.execute();
		if (!opens_anchored_prompt(command)) restore_canvas_focus(event);
	}
</script>

{#snippet menu_shortcut(keys: string[])}
	<span class="ml-auto inline-flex shrink-0 gap-1 pl-5" aria-hidden="true">
		{#each keys as key (key)}
			<kbd class="ew-shortcut-key">{key}</kbd>
		{/each}
	</span>
{/snippet}

{#snippet selection_leading_contents()}
	<button
		class="{tw_toolbar_btn} {session.commands.select_parent?.disabled
			? tw_toolbar_btn_disabled
			: tw_toolbar_btn_hover}"
		onmousedown={handle_btn_mousedown}
		onclick={(e) => handle_btn_click(e, session.commands.select_parent)}
		use:tooltip={{ label: 'Select parent', keys: ['⎋'] }}
		aria-label="Select parent"
	>
		<svg
			class="size-6"
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path
				d="M6.5 12.5C6.5 15.8137 9.18629 18.5 12.5 18.5C15.8137 18.5 18.5 15.8137 18.5 12.5C18.5 9.18629 15.8137 6.5 12.5 6.5"
				stroke="currentColor"
				stroke-linecap="round"
			/>
			<path
				d="M4.48278 4.48206L13 12.9993M9.44657 4.48173L4.48278 4.48206V9.44727"
				stroke="currentColor"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
	{#if can_show_variant_selector}
		<span class="selection-leading-divider mx-1 h-5 w-px shrink-0 bg-(--stroke)" aria-hidden="true"
		></span>
	{/if}
{/snippet}

{#snippet save_group_contents()}
	<span class="mx-1 h-5 w-px shrink-0 bg-(--stroke)" aria-hidden="true"></span>
	{#if cancel_command && !cancel_command.disabled}
		<button
			class="pointer-events-auto inline-flex min-h-9 w-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 text-sm leading-5 font-medium text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 sm:w-auto sm:px-3 sm:py-2"
			onclick={() => cancel_command.execute()}
			use:tooltip={{ label: 'Cancel editing', keys: ['⌃', '⎋'] }}
			aria-label={cancel_button_label}
		>
			<svg class="size-6 sm:hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="12" r="9.5" stroke="currentColor" />
				<path d="M5.25 18.75L18.75 5.25" stroke="currentColor" stroke-linecap="round" />
			</svg>
			<span class="hidden sm:inline">{cancel_button_label}</span>
		</button>
	{/if}

	{#if !app_commands.save_document.disabled}
		<button
			class="pointer-events-auto inline-flex min-h-9 w-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 text-sm leading-5 font-medium text-(--editing) hover:bg-(--editing-muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--editing)/15 sm:w-auto sm:px-3 sm:py-2"
			onclick={() => app_commands.save_document.execute()}
			use:tooltip={{ label: 'Save changes', keys: ['⌘', 'S'] }}
			aria-label="Save changes"
		>
			<svg class="size-6 sm:hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M4 3.5H16.5L20 7V20.5H4V3.5Z" stroke="currentColor" />
				<path d="M7.5 3.5V9.5H16.5V3.5M7.5 20.5V13.5H16.5V20.5" stroke="currentColor" />
			</svg>
			<span class="hidden sm:inline">Save</span>
		</button>
	{/if}
{/snippet}

{#if editable || can_show_read_toolbar}
	<div
		class="toolbar-layout pointer-events-none fixed {tw_toolbar_position} z-50 flex min-w-0 items-center gap-3"
		style:--keyboard-inset="{keyboard_inset}px"
	>
		{#if editable && can_select_parent}
			<div class="mobile-selection-leading shrink-0 items-center">
				{@render selection_leading_contents()}
			</div>
		{/if}

		<div
			class="toolbar-middle min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
		>
			{#if editable && can_show_selection_tool_group}
				<div
					class="editor-toolbar selection-toolbar flex shrink items-center gap-1 {tw_toolbar_surface}"
				>
					{#if can_select_parent}
						<div class="desktop-selection-leading flex shrink-0 items-center gap-1">
							{@render selection_leading_contents()}
						</div>
					{/if}
					{#if can_show_variant_selector}
						<!-- Not a scroll container: long labels truncate. min-w-0 lets it shrink. -->
						<div class="variant-slot min-w-0" class:mobile-hidden={!is_single_node_selected}>
							<NodeNavigator {session} {focus_canvas} />
						</div>
					{/if}
				</div>
			{/if}

			<div class="toolbar-spacer min-w-0 flex-1"></div>

			<div class="editor-toolbar action-toolbar flex shrink items-center {tw_toolbar_surface}">
				<!-- Four pixels of scroll padding clear the 2px outline and 2px offset.
				The negative margin preserves the pill inset; keep the scrollport square. -->
				<div
					class="tools-scroller -m-1 min-w-0 flex-1 scrollbar-none overflow-x-auto p-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
				>
					<div class="flex min-w-max items-center gap-1">
						{#if !editable}
							<!-- Read mode: New page + Edit + Pages buttons -->
							<div class="flex items-center gap-1">
								{#if can_create_pages}
									<a
										class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
										href={resolve('/new')}
										use:tooltip={{ label: 'New page', keys: ['⌃', '⇧', 'N'] }}
										aria-keyshortcuts="Control+Shift+N"
										aria-label="New page"
									>
										<svg
											class="size-4"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 15 15"
											fill="none"
											aria-hidden="true"
										>
											<path d="M7.5 3V12M3 7.5H12" stroke="currentColor" stroke-linecap="square" />
										</svg>
									</a>
								{/if}

								{#if can_browse_pages}
									<button
										class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
										onclick={() => page_browser?.open_navigate()}
										use:tooltip={{ label: 'Browse pages', keys: ['⌘', 'P'] }}
										aria-label="Browse pages"
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

								{#if can_edit_document}
									<button
										class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
										onclick={handle_edit_document_click}
										use:tooltip={{ label: 'Edit', keys: ['⌘', 'E'] }}
										aria-keyshortcuts="Meta+E Control+E Control+Shift+E"
										aria-label="Edit"
									>
										<svg
											class="size-6"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M4.5 19.5L5.25 15.25L15.75 4.75C16.7165 3.7835 18.2835 3.7835 19.25 4.75C20.2165 5.7165 20.2165 7.2835 19.25 8.25L8.75 18.75L4.5 19.5ZM14 6.5L17.5 10"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</button>
								{/if}

								{#if can_logout}
									<button
										bind:this={page_menu_trigger}
										class="page-actions-trigger {tw_toolbar_btn} {tw_toolbar_btn_hover}"
										aria-haspopup="menu"
										aria-expanded={page_menu_open}
										aria-controls="toolbar-page-actions-menu"
										aria-keyshortcuts="Control+Shift+M"
										popovertarget="toolbar-page-actions-menu"
										use:tooltip={{ label: 'Page actions', keys: ['⌃', '⇧', 'M'] }}
										aria-label="Page actions"
									>
										<svg
											class="size-6"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											aria-hidden="true"
										>
											<circle cx="6" cy="12" r="1" />
											<circle cx="12" cy="12" r="1" />
											<circle cx="18" cy="12" r="1" />
										</svg>
									</button>
									<div
										id="toolbar-page-actions-menu"
										bind:this={page_menu}
										ontoggle={handle_page_menu_toggle}
										onkeydown={handle_page_menu_keydown}
										class="page-actions-menu w-max min-w-44 rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
										popover="auto"
										role="menu"
										tabindex="-1"
										aria-label="Page actions"
									>
										{#if can_manage_current_page}
											<button
												type="button"
												class={tw_page_actions_item}
												popovertarget="toolbar-page-actions-menu"
												popovertargetaction="hide"
												onclick={() => app_commands.duplicate_page.execute()}
												disabled={app_commands.duplicate_page.disabled}
												aria-keyshortcuts="Meta+D Control+D"
												role="menuitem"
												>Duplicate page
												{@render menu_shortcut([is_mac ? '⌘' : 'Ctrl', 'D'])}</button
											>
											<button
												type="button"
												class={tw_page_actions_item}
												popovertarget="toolbar-page-actions-menu"
												popovertargetaction="hide"
												onclick={() => app_commands.edit_page_url.execute()}
												disabled={is_home_page}
												aria-keyshortcuts="Control+Shift+U"
												role="menuitem"
												>Edit URL
												{@render menu_shortcut([
													is_mac ? '⌃' : 'Ctrl',
													is_mac ? '⇧' : 'Shift',
													'U'
												])}</button
											>
											<button
												type="button"
												class={tw_page_actions_item}
												popovertarget="toolbar-page-actions-menu"
												popovertargetaction="hide"
												onclick={open_page_delete_dialog}
												disabled={is_home_page}
												role="menuitem">Delete page</button
											>
											<div class="my-1 h-px bg-(--stroke)" role="separator"></div>
										{/if}
										<button
											type="button"
											class={tw_page_actions_item}
											popovertarget="toolbar-page-actions-menu"
											popovertargetaction="hide"
											onclick={() => app_commands.logout_admin.execute()}
											role="menuitem">Logout</button
										>
									</div>
								{/if}
							</div>
						{:else}
							<!-- Edit mode -->
							<!-- Text formatting group (visible during text selection) -->
							{#if session.selection?.type === 'text'}
								<div class="flex items-center gap-1">
									<!-- Bold -->
									<button
										class="{tw_toolbar_btn} {session.commands.toggle_strong?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										class:!text-(--editing)={session.commands.toggle_strong?.active}
										class:!bg-(--editing-muted)={session.commands.toggle_strong?.active}
										onmousedown={handle_btn_mousedown}
										onclick={(e) => handle_btn_click(e, session.commands.toggle_strong)}
										aria-label="Bold"
										use:tooltip={{ label: 'Bold', keys: ['⌘', 'B'] }}
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M8 11.7667V19H13.0167C15.0141 19 16.6333 17.3808 16.6333 15.3833C16.6333 13.3859 15.0141 11.7667 13.0167 11.7667H8ZM8 11.7667V5H12.55C14.4186 5 15.9333 6.51477 15.9333 8.38333C15.9333 10.2519 14.4186 11.7667 12.55 11.7667H8Z"
												stroke="currentColor"
												stroke-width="2"
												stroke-linejoin="round"
											/>
										</svg>
									</button>

									<!-- Italic -->
									<button
										class="{tw_toolbar_btn} {session.commands.toggle_emphasis?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										class:!text-(--editing)={session.commands.toggle_emphasis?.active}
										class:!bg-(--editing-muted)={session.commands.toggle_emphasis?.active}
										onmousedown={handle_btn_mousedown}
										onclick={(e) => handle_btn_click(e, session.commands.toggle_emphasis)}
										aria-label="Italic"
										use:tooltip={{ label: 'Italic', keys: ['⌘', 'I'] }}
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M10 19.5L14 4.5M10 19.5H5.5M10 19.5H14.5M14 4.5H18.5M14 4.5H9.5"
												stroke="currentColor"
												stroke-linecap="round"
											/>
										</svg>
									</button>

									<!-- Code -->
									<button
										class="{tw_toolbar_btn} {session.commands.toggle_code?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										class:!text-(--editing)={session.commands.toggle_code?.active}
										class:!bg-(--editing-muted)={session.commands.toggle_code?.active}
										onmousedown={handle_btn_mousedown}
										onclick={(e) => handle_btn_click(e, session.commands.toggle_code)}
										use:tooltip={{ label: 'Code', keys: ['⌘', '⇧', 'C'] }}
										aria-label="Code"
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
											aria-hidden="true"
										>
											<path
												d="M15.422 6.85559L20.5664 12L15.422 17.1444"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
											<path
												d="M8.5741 6.85559L3.42969 12L8.5741 17.1444"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
										</svg>
									</button>

									<!-- Highlight -->
									<button
										class="{tw_toolbar_btn} {session.commands.toggle_highlight?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										class:!text-(--editing)={session.commands.toggle_highlight?.active}
										class:!bg-(--editing-muted)={session.commands.toggle_highlight?.active}
										onmousedown={handle_btn_mousedown}
										onclick={(e) => handle_btn_click(e, session.commands.toggle_highlight)}
										aria-label="Highlight"
										use:tooltip={{ label: 'Highlight', keys: ['⌘', 'U'] }}
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M12.2213 2.36648C12.7152 1.37848 13.9165 0.977924 14.9045 1.47182C15.8925 1.96571 16.2931 3.16702 15.7992 4.15502L7.58735 20.5823L4.80832 22.669C4.47866 22.9166 4.00792 22.6813 4.00808 22.269L4.00948 18.7937L12.2213 2.36648Z"
												fill="currentColor"
											/>
											<path
												d="M19.9298 19.4968C19.9298 19.4968 15.5167 17.2024 15.5167 13.0671C15.5167 8.29339 21.4879 5.77291 21.4879 11.0664C21.4879 17.704 14.4662 20.1661 10.5039 19.4968"
												stroke="currentColor"
												stroke-linecap="round"
											/>
										</svg>
									</button>

									<!-- Link -->
									<button
										class="{tw_toolbar_btn} {session.commands.toggle_link?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										class:!text-(--editing)={session.commands.toggle_link?.active}
										class:!bg-(--editing-muted)={session.commands.toggle_link?.active}
										onmousedown={handle_btn_mousedown}
										onclick={(e) => handle_btn_click(e, session.commands.toggle_link)}
										aria-label="Link"
										use:tooltip={{ label: 'Link', keys: ['⌘', 'K'] }}
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
										>
											<path
												d="M14.6668 11.5189C14.4506 11.0529 14.1503 10.6163 13.7659 10.2319C12.0086 8.47455 9.23819 8.5329 7.40199 10.2319C6.66799 10.9111 5.95984 11.6192 5.28067 12.3532C3.58406 14.1867 3.52331 16.9598 5.28067 18.7172C7.03802 20.4745 9.81111 20.4138 11.6446 18.7172C12.0107 18.3785 12.3703 18.0326 12.7231 17.6798"
												stroke="currentColor"
												stroke-linecap="round"
											/>
											<path
												d="M9.32925 12.4811C9.54548 12.9471 9.84578 13.3837 10.2301 13.7681C11.9875 15.5255 14.7579 15.4671 16.5941 13.7681C17.3281 13.0889 18.0363 12.3808 18.7154 11.6468C20.412 9.81325 20.4728 7.04017 18.7154 5.28281C16.9581 3.52545 14.185 3.58621 12.3515 5.28281C11.9854 5.62151 11.6258 5.96742 11.273 6.32015"
												stroke="currentColor"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								</div>
							{/if}

							<!-- Media actions (visible when media is selected) -->
							{#if is_media_selected && app.allow_structural_changes}
								<div class="flex items-center gap-1">
									<button
										class="{tw_toolbar_btn} {session.commands.edit_image?.disabled
											? tw_toolbar_btn_disabled
											: tw_toolbar_btn_hover}"
										onmousedown={handle_btn_mousedown}
										onclick={handle_edit_image_click}
										use:tooltip={{ label: 'Alt text', keys: ['⌥', '⏎'] }}
										aria-label="Alt text"
									>
										<span
											class="inline-flex h-4 min-w-5 items-center justify-center rounded-[3px] border border-current px-0.5 text-[8px] leading-none font-medium tracking-[0.04em]"
											aria-hidden="true">ALT</span
										>
									</button>

									<button
										id="replace-media-btn"
										class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
										onmousedown={handle_btn_mousedown}
										onclick={handle_replace_image_click}
										use:tooltip={{ label: 'Replace image', keys: ['⏎'] }}
										aria-label="Replace image"
									>
										<svg
											class="size-6"
											viewBox="0 0 24 24"
											fill="none"
											xmlns="http://www.w3.org/2000/svg"
											aria-hidden="true"
										>
											<path
												d="M4.5 17.5L9 13L12 16L14.5 13.5L19.5 18.5M5.5 4.5H18.5C19.0523 4.5 19.5 4.94772 19.5 5.5V18.5C19.5 19.0523 19.0523 19.5 18.5 19.5H5.5C4.94772 19.5 4.5 19.0523 4.5 18.5V5.5C4.5 4.94772 4.94772 4.5 5.5 4.5Z"
												stroke="currentColor"
												stroke-linecap="round"
												stroke-linejoin="round"
											/>
											<circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" />
										</svg>
									</button>
								</div>
							{/if}

							{#if app.allow_structural_changes && (session.selection?.type === 'node' || is_media_selected)}
								<div class="flex items-center gap-1">
									{#if is_node_caret && !session.commands.insert_default_node?.disabled}
										<button
											class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
											onmousedown={handle_btn_mousedown}
											onclick={handle_insert_default_node_click}
											use:tooltip={{ label: 'Insert', keys: ['↵'] }}
											aria-label="Insert"
										>
											<svg
												class="size-4"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 15 15"
												fill="none"
												aria-hidden="true"
											>
												<path
													d="M7.5 3V12M3 7.5H12"
													stroke="currentColor"
													stroke-linecap="square"
												/>
											</svg>
										</button>
									{/if}
									{#if session.selection?.type === 'node' && !is_node_caret && !session.commands.toggle_section?.disabled}
										<button
											class="{tw_toolbar_btn} {tw_toolbar_btn_hover}"
											class:!text-(--editing)={session.commands.toggle_section?.active}
											class:!bg-(--editing-muted)={session.commands.toggle_section?.active}
											onmousedown={handle_btn_mousedown}
											onclick={(e) => handle_btn_click(e, session.commands.toggle_section)}
											use:tooltip={{ label: 'Toggle section', keys: ['⌘', '⇧', 'S'] }}
											aria-label="Toggle section"
										>
											<svg
												class="size-6"
												viewBox="0 0 24 24"
												fill="none"
												xmlns="http://www.w3.org/2000/svg"
												aria-hidden="true"
											>
												<path
													d="M15.9706 4.5L17.5 4.5C18.6046 4.5 19.5 5.39543 19.5 6.5L19.5 17.5C19.5 18.6046 18.6046 19.5 17.5 19.5L15.9706 19.5"
													stroke="currentColor"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
												<path
													d="M8.02941 4.5L6.5 4.5C5.39543 4.5 4.5 5.39543 4.5 6.5L4.5 17.5C4.5 18.6046 5.39543 19.5 6.5 19.5L8.02941 19.5"
													stroke="currentColor"
													stroke-linecap="round"
													stroke-linejoin="round"
												/>
											</svg>
										</button>
									{/if}
									<button
										class="{tw_toolbar_btn} aspect-square {tw_toolbar_btn_hover}"
										onmousedown={handle_btn_mousedown}
										onclick={handle_delete_selection_click}
										use:tooltip={{ label: 'Delete backwards', keys: ['⌫'] }}
										aria-label="Delete backwards"
									>
										<svg
											class="size-6"
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="none"
											aria-hidden="true"
										>
											<path
												d="M6.89951 5.25063C7.27906 4.77619 7.85369 4.5 8.46126 4.5H17.5C18.6046 4.5 19.5 5.39543 19.5 6.5V17.5003C19.5 18.6049 18.6046 19.5003 17.5 19.5003H8.46126C7.85369 19.5003 7.27906 19.2242 6.89951 18.7497L2.49948 13.2495C1.91514 12.5191 1.91514 11.4812 2.49948 10.7508L6.89951 5.25063Z"
												stroke="currentColor"
												stroke-linecap="round"
											/>
											<path
												d="M14.9528 14.4762L12.4764 11.9998L10 9.52344M14.9528 9.52344L10 14.4762"
												stroke="currentColor"
												stroke-linecap="round"
											/>
										</svg>
									</button>
								</div>
							{/if}

							<!-- Hidden file input for replace-image -->
							<input
								id="replace-media-input"
								bind:this={file_input_ref}
								type="file"
								accept="image/*,video/*"
								class="hidden"
								onchange={handle_file_selected}
							/>

							<!-- Stable right group: Undo / Redo -->
							<div class="flex items-center gap-1">
								<button
									class="{tw_toolbar_btn} {session.commands.undo?.disabled
										? tw_toolbar_btn_disabled
										: tw_toolbar_btn_hover}"
									onmousedown={handle_btn_mousedown}
									onclick={(e) => handle_btn_click(e, session.commands.undo)}
									aria-label="Undo"
									use:tooltip={{ label: 'Undo', keys: ['⌘', 'Z'] }}
								>
									<svg
										class="size-6"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M2.5 7.4994L16.0672 7.49941C19.1045 7.49941 21.5667 9.96163 21.5667 12.9989C21.5667 16.0362 19.1045 18.4984 16.0672 18.4984H11.5M7.5 2.5L2.5 7.4994L7.5 12.4988"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
								<button
									class="{tw_toolbar_btn} {session.commands.redo?.disabled
										? tw_toolbar_btn_disabled
										: tw_toolbar_btn_hover}"
									onmousedown={handle_btn_mousedown}
									onclick={(e) => handle_btn_click(e, session.commands.redo)}
									aria-label="Redo"
									use:tooltip={{ label: 'Redo', keys: ['⌘', '⇧', 'Z'] }}
								>
									<svg
										class="size-6"
										viewBox="0 0 24 24"
										fill="none"
										xmlns="http://www.w3.org/2000/svg"
									>
										<path
											d="M21.5664 7.4994L7.99925 7.49941C4.96195 7.49941 2.49973 9.96163 2.49973 12.9989C2.49973 16.0362 4.96195 18.4984 7.99925 18.4984H12.4988M16.5664 2.5L21.5664 7.4994L16.5664 12.4988"
											stroke="currentColor"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
								</button>
							</div>
						{/if}
					</div>
				</div>

				{#if editable}
					<div class="desktop-save-group flex shrink-0 items-center gap-1">
						{@render save_group_contents()}
					</div>
				{/if}
			</div>
		</div>

		{#if editable}
			<div class="mobile-save-group shrink-0 items-center">
				{@render save_group_contents()}
			</div>
		{/if}
	</div>
{/if}

<style>
	.page-actions-trigger {
		anchor-name: --toolbar-page-actions;
	}

	.page-actions-menu {
		position: fixed;
		position-anchor: --toolbar-page-actions;
		position-area: block-start span-inline-end;
		justify-self: anchor-center;
		inset: auto;
		margin: 0 12px 8px;
	}

	.selection-leading-divider {
		display: block;
		align-self: center;
	}

	.mobile-selection-leading,
	.mobile-save-group {
		display: none;
	}

	.toolbar-middle {
		display: contents;
	}

	/* Touch only: a transform here would make this fixed element a containing
	   block. The mobile rule below re-declares it alongside translateX. */
	@media (hover: none), (pointer: coarse) {
		.toolbar-layout {
			transform: translateY(calc(-1 * var(--keyboard-inset, 0px)));
		}
	}

	@media (max-width: 639px) {
		.toolbar-layout {
			right: auto;
			left: 50%;
			width: max-content;
			max-width: calc(100vw - 2.5rem);
			transform: translateX(-50%) translateY(calc(-1 * var(--keyboard-inset, 0px)));
			overflow: visible;
			gap: 4px;
			/* Keep the same inset when the leading and save groups are absent. */
			padding: 4px;
			color: var(--foreground);
			background: var(--background);
			border: 1px solid var(--stroke);
			border-radius: var(--button-border-radius);
			pointer-events: auto;
		}

		.desktop-selection-leading,
		.desktop-save-group {
			display: none;
		}

		.toolbar-middle {
			display: flex;
			flex: 0 1 auto;
			min-width: 0;
			overflow-x: auto;
			overscroll-behavior-x: contain;
			scrollbar-width: none;
			/* Clear the 2px outline and 2px offset on every edge of the scrollport. */
			padding: 4px;
			margin: -4px;
			gap: 4px;
		}

		.toolbar-middle > .editor-toolbar {
			display: contents;
			padding: 0;
			background: transparent;
			border: 0;
			border-radius: 0;
			box-shadow: none;
			backdrop-filter: none;
		}

		.toolbar-spacer {
			display: none;
		}

		.variant-slot,
		.tools-scroller {
			display: contents;
		}

		/* Two classes so this wins over the display: contents above. */
		.variant-slot.mobile-hidden {
			display: none;
		}

		.mobile-selection-leading {
			display: flex;
			flex: none;
			align-self: stretch;
			gap: 4px;
		}

		.mobile-save-group {
			display: flex;
			flex: none;
			align-self: stretch;
			gap: 4px;
		}
	}
</style>
