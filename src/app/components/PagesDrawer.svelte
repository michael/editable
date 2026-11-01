<script lang="ts">
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';
	import { page } from '$app/state';

	import { get_page_browser_data } from '#app/api.remote.js';
	import Media from './Media.svelte';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';
	import { get_page_url_dialog } from '#app/page_url_dialog_context.svelte.js';
	import { get_page_delete_dialog } from '#app/page_delete_dialog_context.svelte.js';

	const page_browser = get_page_browser();
	const page_url_dialog = get_page_url_dialog();
	const page_delete_dialog = get_page_delete_dialog();

	let browser_data = $state(null);
	let loading = $state(false);
	let load_error = $state('');

	let menu_item = $state(null);
	let menu_anchor_name = $state('');
	let menu_ref = $state(null);
	let menu_item_refs = $state([]);
	let menu_selected_index = $state(0);

	let unlisted_info_item = $state(null);
	let unlisted_info_ref = $state(null);

	let shadowed_info_item = $state(null);
	let shadowed_info_ref = $state(null);

	let search_query = $state('');
	let search_input_ref = $state(null);
	// selected_result_index is genuinely hybrid state: reset by search changes,
	// clamped against visible results, and driven by keyboard navigation — a
	// writable $derived would obscure those interacting writers.
	// eslint-disable-next-line svelte/prefer-writable-derived
	let selected_result_index = $state(0);
	let tree_ref = $state(null);
	let initialized_selection_version = $state(-1);
	let initial_scroll_frame_id = $state(null);

	function scroll_selected_result_into_view(visible_results, direction = 'nearest') {
		const selected_document_id = visible_results[selected_result_index]?.document_id;
		if (!selected_document_id || !tree_ref) return;

		requestAnimationFrame(() => {
			const selected_row = tree_ref?.querySelector(
				`[data-page-browser-row="${selected_document_id}"]`
			);
			if (!(selected_row instanceof HTMLElement)) return;

			const scroll_container = tree_ref.closest('.ew-drawer-panel');
			if (!(scroll_container instanceof HTMLElement)) return;

			const scroll_container_rect = scroll_container.getBoundingClientRect();
			const search_shell = tree_ref.closest('.ew-pages-drawer')?.querySelector('.ew-search-shell');
			const search_shell_rect =
				search_shell instanceof HTMLElement ? search_shell.getBoundingClientRect() : null;

			const visible_top = Math.max(
				scroll_container_rect.top,
				search_shell_rect?.bottom ?? scroll_container_rect.top
			);
			const visible_bottom = scroll_container_rect.bottom;
			const row_rect = selected_row.getBoundingClientRect();
			const row_height = row_rect.height;
			const context_padding = row_height * 1.5;

			if (direction === 'down') {
				const target_bottom = row_rect.bottom + context_padding;
				if (target_bottom > visible_bottom) {
					scroll_container.scrollTop += target_bottom - visible_bottom;
				}
				return;
			}

			if (direction === 'up') {
				const target_top = row_rect.top - context_padding;
				if (target_top < visible_top) {
					scroll_container.scrollTop -= visible_top - target_top;
				}
				return;
			}

			if (row_rect.top < visible_top) {
				scroll_container.scrollTop -= visible_top - (row_rect.top - context_padding);
				return;
			}

			if (row_rect.bottom > visible_bottom) {
				scroll_container.scrollTop += row_rect.bottom + context_padding - visible_bottom;
			}
		});
	}

	function clear_initial_scroll_frame() {
		if (initial_scroll_frame_id === null) return;
		cancelAnimationFrame(initial_scroll_frame_id);
		initial_scroll_frame_id = null;
	}

	const browser_data_query = $derived.by(() => {
		page_browser?.version ?? 0;
		if (!page_browser.state.open) return null;
		return get_page_browser_data(page.url.href);
	});

	$effect(() => {
		const query = browser_data_query;

		if (!query) {
			loading = false;
			load_error = '';
			return;
		}

		loading = query.loading;
		load_error = query.error ? 'Failed to load pages.' : '';
		browser_data = query.current ?? null;

		const current_page_id = query.current
			? ((query.current.current_document_id ?? null) as string | null)
			: null;

		if (
			page_browser.state.open &&
			!query.loading &&
			initialized_selection_version !== (page_browser?.version ?? 0) &&
			!normalized_search_query &&
			current_page_id
		) {
			const current_page_forest = query.current.page_forest ?? [];
			const current_filtered_page_forest = filter_page_forest(
				current_page_forest,
				normalize_search_text(search_query)
			);
			const current_visible_results = flatten_page_forest_results(current_filtered_page_forest);

			initialized_selection_version = page_browser?.version ?? 0;

			if (current_visible_results.length > 0) {
				const current_result_index = get_visible_result_index(
					current_page_id,
					current_visible_results
				);

				if (current_result_index !== -1) {
					selected_result_index = current_result_index;
					clear_initial_scroll_frame();
					initial_scroll_frame_id = requestAnimationFrame(() => {
						initial_scroll_frame_id = null;
						scroll_selected_result_into_view(current_visible_results);
					});
				}
			}
		}
	});

	$effect(() => {
		if (menu_item && menu_ref && !menu_ref.open) {
			menu_ref.showModal();
		} else if (!menu_item && menu_ref?.open) {
			menu_ref.close();
		}
	});

	$effect(() => {
		if (!menu_item) {
			menu_item_refs = [];
			menu_selected_index = 0;
			return;
		}

		requestAnimationFrame(() => {
			const enabled_index = menu_item_refs.findIndex((item_ref) => !item_ref?.disabled);
			menu_selected_index = enabled_index === -1 ? 0 : enabled_index;
			menu_item_refs[menu_selected_index]?.focus();
		});
	});

	$effect(() => {
		if (unlisted_info_item && unlisted_info_ref && !unlisted_info_ref.open) {
			unlisted_info_ref.showModal();
		} else if (!unlisted_info_item && unlisted_info_ref?.open) {
			unlisted_info_ref.close();
		}
	});

	$effect(() => {
		if (shadowed_info_item && shadowed_info_ref && !shadowed_info_ref.open) {
			shadowed_info_ref.showModal();
		} else if (!shadowed_info_item && shadowed_info_ref?.open) {
			shadowed_info_ref.close();
		}
	});

	$effect(() => {
		if (!page_browser.state.open) {
			initialized_selection_version = -1;
			clear_initial_scroll_frame();
			return;
		}

		search_query = '';

		if (!search_input_ref) return;

		requestAnimationFrame(() => {
			const is_desktop_focus = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
			if (!is_desktop_focus) return;
			search_input_ref?.focus();
			search_input_ref?.select();
		});

		return () => {
			clear_initial_scroll_frame();
		};
	});

	function get_page_count(node) {
		if (!node) return 0;

		let count = 1;
		for (const child of node.children ?? []) {
			count += get_page_count(child);
		}
		return count;
	}

	function get_page_forest_count(nodes) {
		let count = 0;
		for (const node of nodes ?? []) {
			count += get_page_count(node);
		}
		return count;
	}

	function get_resolved_page_href(page_href: string) {
		return resolve_href(page_href || '/', site);
	}

	function get_page_slug_label(page_href) {
		return page_href || '/';
	}

	function format_page_browser_timestamp(value) {
		if (!value) return 'Unknown';

		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return value;

		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
	}

	function get_page_title_tooltip(node) {
		const slug_label = get_page_slug_label(node.page_href);
		const created_at_label = format_page_browser_timestamp(node.created_at);
		const updated_at_label = format_page_browser_timestamp(node.updated_at);

		return `URL: ${slug_label}
Created: ${created_at_label}
Updated: ${updated_at_label}`;
	}

	function is_home_page(document_id) {
		return browser_data?.home_page_id === document_id;
	}

	function has_children(node) {
		return !!node?.children?.length;
	}

	function is_root_node(node, depth) {
		return depth === 0;
	}

	function is_non_home_root_node(node, depth) {
		return depth === 0 && !is_home_page(node.document_id);
	}

	function is_unlisted_page(node, depth, ancestor_is_undiscoverable = false) {
		return ancestor_is_undiscoverable || is_non_home_root_node(node, depth);
	}

	function open_unlisted_info(event, item) {
		event.preventDefault();
		event.stopPropagation();
		unlisted_info_item = item;
	}

	function close_unlisted_info() {
		unlisted_info_item = null;
	}

	function handle_unlisted_info_click(event) {
		if (event.target === unlisted_info_ref) {
			close_unlisted_info();
		}
	}

	function handle_unlisted_info_cancel(event) {
		event.preventDefault();
		close_unlisted_info();
	}

	function open_shadowed_info(event, item) {
		event.preventDefault();
		event.stopPropagation();
		shadowed_info_item = item;
	}

	function close_shadowed_info() {
		shadowed_info_item = null;
	}

	function handle_shadowed_info_click(event) {
		if (event.target === shadowed_info_ref) {
			close_shadowed_info();
		}
	}

	function handle_shadowed_info_cancel(event) {
		event.preventDefault();
		close_shadowed_info();
	}

	function select_page(document_id) {
		const selected_page = flatten_page_forest_results(page_forest).find(
			(page_node) => page_node.document_id === document_id
		);
		if (selected_page) page_browser.handle_page_selected(selected_page);
	}

	function handle_page_click(event, document_id) {
		// Preserve the browser's background-tab behavior for Command-clicks.
		if (!is_picker_mode && event.metaKey) return;
		event.preventDefault();
		select_page(document_id);
	}

	function get_menu_anchor_name(document_id) {
		return `--page-actions-${document_id}`;
	}

	function open_menu(event, item) {
		event.preventDefault();
		event.stopPropagation();
		menu_anchor_name = get_menu_anchor_name(item.document_id);
		menu_item = item;
	}

	function close_menu() {
		menu_item = null;
		menu_anchor_name = '';
	}

	function open_confirm() {
		if (!menu_item || menu_item.is_home_page) return;
		page_delete_dialog.open({
			document_id: menu_item.document_id,
			title: menu_item.title,
			is_current_page: browser_data?.current_document_id === menu_item.document_id,
			// Clear the cached rows eagerly so the drawer doesn't show the deleted
			// page while the refetch is in flight.
			on_deleted: () => {
				browser_data = null;
			}
		});
		close_menu();
	}

	function open_page_url_dialog() {
		if (!menu_item || menu_item.is_home_page) return;
		page_url_dialog.open({
			document_id: menu_item.document_id,
			page_href: menu_item.page_href,
			// Clear the cached rows eagerly so the drawer doesn't show the old URL
			// while the refetch is in flight.
			on_saved: () => {
				browser_data = null;
			}
		});
		close_menu();
	}

	function handle_menu_click(event) {
		if (event.target === menu_ref) {
			event.preventDefault();
			event.stopPropagation();
			close_menu();
		}
	}

	function handle_menu_keydown(event) {
		if (!menu_item) return;

		const enabled_item_refs = menu_item_refs.filter((item_ref) => item_ref && !item_ref.disabled);
		if (enabled_item_refs.length === 0) return;

		const current_enabled_index = enabled_item_refs.findIndex(
			(item_ref) => item_ref === menu_item_refs[menu_selected_index]
		);

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const next_enabled_index =
				current_enabled_index === -1 ? 0 : (current_enabled_index + 1) % enabled_item_refs.length;
			const next_item_ref = enabled_item_refs[next_enabled_index];
			const next_index = menu_item_refs.findIndex((item_ref) => item_ref === next_item_ref);
			if (next_index !== -1) {
				menu_selected_index = next_index;
				next_item_ref.focus();
			}
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const next_enabled_index =
				current_enabled_index === -1
					? enabled_item_refs.length - 1
					: (current_enabled_index - 1 + enabled_item_refs.length) % enabled_item_refs.length;
			const next_item_ref = enabled_item_refs[next_enabled_index];
			const next_index = menu_item_refs.findIndex((item_ref) => item_ref === next_item_ref);
			if (next_index !== -1) {
				menu_selected_index = next_index;
				next_item_ref.focus();
			}
			return;
		}

		if (event.key === 'Enter') {
			const active_item = document.activeElement;
			if (active_item instanceof HTMLButtonElement && active_item.closest('.ew-menu-panel')) {
				event.preventDefault();
				active_item.click();
			}
		}
	}

	function handle_menu_cancel(event) {
		event.preventDefault();
		close_menu();
	}

	async function open_in_new_tab() {
		if (!menu_item?.page_href) return;
		window.open(get_resolved_page_href(menu_item.page_href), '_blank', 'noopener,noreferrer');
		close_menu();
	}

	function normalize_search_text(value) {
		return (value ?? '').trim().toLowerCase();
	}

	function get_page_search_text(item) {
		return `${item?.title ?? ''} ${item?.page_href ?? ''}`.trim().toLowerCase();
	}

	function item_matches_search(item, normalized_query) {
		if (!normalized_query) return false;
		return get_page_search_text(item).includes(normalized_query);
	}

	function get_highlight_parts(text, normalized_query) {
		const source_text = text ?? '';
		if (!normalized_query) {
			return [{ text: source_text, is_match: false }];
		}

		const lower_text = source_text.toLowerCase();
		const match_index = lower_text.indexOf(normalized_query);

		if (match_index === -1) {
			return [{ text: source_text, is_match: false }];
		}

		const parts = [];
		if (match_index > 0) {
			parts.push({ text: source_text.slice(0, match_index), is_match: false });
		}
		parts.push({
			text: source_text.slice(match_index, match_index + normalized_query.length),
			is_match: true
		});
		if (match_index + normalized_query.length < source_text.length) {
			parts.push({
				text: source_text.slice(match_index + normalized_query.length),
				is_match: false
			});
		}
		return parts;
	}

	/** Keep matching pages with all their children, and the ancestors of matches. */
	function filter_page_forest_node(node, normalized_query) {
		if (!normalized_query || item_matches_search(node, normalized_query)) return node;
		const children = filter_page_forest(node.children, normalized_query);
		return children.length > 0 ? { ...node, children } : null;
	}

	function filter_page_forest(nodes, normalized_query) {
		return (nodes ?? [])
			.map((node) => filter_page_forest_node(node, normalized_query))
			.filter(Boolean);
	}

	function flatten_page_forest_results(nodes) {
		const results = [];

		for (const node of nodes ?? []) {
			results.push(node);

			for (const child of node.children ?? []) {
				results.push(...flatten_page_forest_results([child]));
			}
		}

		return results;
	}

	function get_visible_result_index(document_id, visible_results) {
		return visible_results.findIndex((result) => result.document_id === document_id);
	}

	function clamp_selected_result_index(index, visible_results) {
		if (visible_results.length === 0) return 0;
		return Math.min(Math.max(index, 0), visible_results.length - 1);
	}

	function handle_search_keydown(event, visible_results) {
		if (visible_results.length === 0) return;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			selected_result_index = clamp_selected_result_index(
				selected_result_index + 1,
				visible_results
			);
			scroll_selected_result_into_view(visible_results, 'down');
			return;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			selected_result_index = clamp_selected_result_index(
				selected_result_index - 1,
				visible_results
			);
			scroll_selected_result_into_view(visible_results, 'up');
			return;
		}

		if (event.key === 'Enter' && event.target === search_input_ref) {
			event.preventDefault();
			const selected_result = visible_results[selected_result_index];
			if (!selected_result) return;

			select_page(selected_result.document_id);
		}
	}

	let normalized_search_query = $derived(normalize_search_text(search_query));
	let page_forest = $derived(browser_data?.page_forest ?? []);
	let filtered_page_forest = $derived(filter_page_forest(page_forest, normalized_search_query));
	let visible_results = $derived(flatten_page_forest_results(filtered_page_forest));
	let page_count = $derived(get_page_forest_count(page_forest));
	let is_picker_mode = $derived(page_browser.state.mode === 'select');

	$effect(() => {
		normalized_search_query;
		selected_result_index = 0;
	});

	$effect(() => {
		selected_result_index = clamp_selected_result_index(selected_result_index, visible_results);
	});
</script>

<div class="ew-pages-drawer">
	<!-- Parks focus inside the drawer without opening the mobile keyboard. showModal()
	focuses the first focusable element, so keep this first in the drawer. -->
	<button type="button" class="ew-drawer-initial-focus-target" aria-label="Pages drawer"></button>

	<div class="ew-search-shell">
		<label class="ew-search-input-shell">
			<svg
				class="ew-search-input-icon"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 15 15"
				fill="none"
				aria-hidden="true"
			>
				<circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor"></circle>
				<path d="M10 10L13 13" stroke="currentColor" stroke-linecap="square"></path>
			</svg>
			<input
				bind:this={search_input_ref}
				type="search"
				class="ew-search-input"
				bind:value={search_query}
				placeholder={`Search ${page_count} pages`}
				aria-label={`Search ${page_count} pages`}
				onkeydown={(event) => handle_search_keydown(event, visible_results)}
			/>
		</label>
	</div>

	<section class="ew-section">
		{#if loading && !browser_data}
			<div class="ew-status-message" role="status">Loading pages…</div>
		{:else if load_error}
			<div class="ew-status-message" role="alert">{load_error}</div>
		{:else}
			<div class="ew-tree" bind:this={tree_ref}>
				{#snippet node_item(
					node,
					depth = 0,
					is_last = true,
					ancestor_columns = [],
					ancestor_is_unlisted = false
				)}
					{@const node_has_children = has_children(node)}
					{@const node_is_root = is_root_node(node, depth)}
					{@const node_is_unlisted = is_unlisted_page(node, depth, ancestor_is_unlisted)}
					{@const current_column_continues = node_is_root ? false : !is_last}
					{@const guide_column_count = ancestor_columns.length}
					<div class="ew-tree-node">
						<div class="ew-tree-row-shell" style={`--tree-guide-columns: ${guide_column_count};`}>
							<div class="ew-tree-guides" aria-hidden="true">
								{#each ancestor_columns as show_rail, guide_index (`${depth}-${guide_index}`)}
									<div class="ew-tree-guide-column">
										{#if show_rail}
											<div class="ew-tree-guide-rail"></div>
										{/if}
									</div>
								{/each}

								{#if !node_is_root}
									<div class="ew-tree-gutter">
										<div class="ew-tree-gutter-rail ew-tree-gutter-rail-top"></div>
										{#if current_column_continues}
											<div class="ew-tree-gutter-rail ew-tree-gutter-rail-bottom"></div>
										{/if}
										<div class="ew-tree-gutter-elbow"></div>
									</div>
								{/if}
							</div>

							<a
								class="ew-tree-row"
								class:ew-tree-row-root={node_is_root}
								class:ew-tree-row-keyboard-selected={visible_results[selected_result_index]
									?.document_id === node.document_id}
								data-page-browser-row={node.document_id}
								title={get_page_title_tooltip(node)}
								href={get_resolved_page_href(node.page_href)}
								onclick={(event) => handle_page_click(event, node.document_id)}
							>
								<div class="ew-page-illustration ew-tree-illustration" aria-hidden="true">
									{#if node.preview_media_node?.src}
										<div class="ew-media-preview">
											<Media node={{ ...node.preview_media_node, object_fit: 'cover' }} />
										</div>
									{:else}
										<div class="ew-page-illustration-fallback ew-bg-checkerboard"></div>
									{/if}
								</div>

								<div class="ew-tree-label">
									<div class="ew-tree-title">
										{#each get_highlight_parts(node.title, normalized_search_query) as part, part_index (`title-${node.document_id}-${part_index}`)}
											<span class:ew-match-highlight={part.is_match}>{part.text}</span>
										{/each}
									</div>
								</div>

								<div class="ew-tree-row-meta">
									{#if node.shadowed_by_markdown || node.shadowed_by_language}
										<button
											type="button"
											class="ew-unlisted-badge ew-shadowed-badge"
											title="Explain why this page is unreachable"
											aria-label={`Explain why ${node.title} is unreachable`}
											onclick={(event) =>
												open_shadowed_info(event, {
													document_id: node.document_id,
													title: node.title,
													slug: node.slug,
													shadowed_by_language: node.shadowed_by_language
												})}
										>
											URL TAKEN
										</button>
									{/if}

									{#if node_is_unlisted}
										<button
											type="button"
											class="ew-unlisted-badge"
											title="Explain what unlisted means"
											aria-label={`Explain what unlisted means for ${node.title}`}
											onclick={(event) =>
												open_unlisted_info(event, {
													document_id: node.document_id,
													title: node.title
												})}
										>
											UNLISTED
										</button>
									{/if}
								</div>
							</a>

							{#if !is_picker_mode}
								<button
									type="button"
									class="ew-item-actions-btn"
									style={`anchor-name: ${get_menu_anchor_name(node.document_id)};`}
									aria-label={`Page actions for ${node.title}`}
									onclick={(event) =>
										open_menu(event, {
											kind: 'page',
											document_id: node.document_id,
											page_href: node.page_href,
											title: node.title,
											is_home_page: is_home_page(node.document_id)
										})}
								>
									<svg
										class="ew-tree-actions-dots"
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
							{/if}
						</div>

						{#if node_has_children}
							<div class="ew-tree-children">
								{#each node.children as child, index (child.document_id)}
									{@render node_item(
										child,
										depth + 1,
										index === node.children.length - 1,
										[...ancestor_columns, current_column_continues],
										node_is_unlisted
									)}
								{/each}
							</div>
						{/if}
					</div>
				{/snippet}

				{#if normalized_search_query && filtered_page_forest.length === 0}
					<div class="ew-status-message">No matching pages.</div>
				{:else if !normalized_search_query && page_forest.length === 0}
					<div class="ew-status-message">No pages yet.</div>
				{:else}
					{#each filtered_page_forest as root_node, index (root_node.document_id)}
						{@render node_item(root_node, 0, index === filtered_page_forest.length - 1, [], false)}
					{/each}
				{/if}
			</div>
		{/if}
	</section>
</div>

<dialog
	bind:this={menu_ref}
	class="m-0 h-screen max-h-none w-screen max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	oncancel={handle_menu_cancel}
	onclick={handle_menu_click}
	onkeydown={handle_menu_keydown}
>
	{#if menu_item}
		<div
			class="ew-menu-panel"
			style={`position-anchor: ${menu_anchor_name}; position-area: block-end span-all; justify-self: anchor-center; position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;`}
		>
			<button
				bind:this={menu_item_refs[0]}
				type="button"
				class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
				onclick={open_in_new_tab}
				onfocus={() => {
					menu_selected_index = 0;
				}}
			>
				Open in new tab
			</button>
			<button
				bind:this={menu_item_refs[1]}
				type="button"
				class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
				onclick={open_page_url_dialog}
				onfocus={() => {
					menu_selected_index = 1;
				}}
				disabled={menu_item.is_home_page}
			>
				Edit URL
			</button>
			<button
				bind:this={menu_item_refs[2]}
				type="button"
				class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11 {menu_item.is_home_page
					? ''
					: 'ew-menu-item-danger'} transition-colors"
				onclick={open_confirm}
				onfocus={() => {
					menu_selected_index = 2;
				}}
				disabled={menu_item.is_home_page}
			>
				Delete
			</button>
		</div>
	{/if}
</dialog>

<dialog
	bind:this={unlisted_info_ref}
	class="m-0 h-screen max-h-none w-screen max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-(--foreground)/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	oncancel={handle_unlisted_info_cancel}
	onclick={handle_unlisted_info_click}
>
	{#if unlisted_info_item}
		<div
			class="fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2.5rem)] w-[min(24rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-4 text-(--foreground)"
		>
			<h3 class="m-0 text-base font-medium">Unlisted page</h3>
			<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
				Unlisted pages are not discoverable from the homepage (and for Google), but can be accessed
				by anyone who has the link.
			</p>
			<div class="flex justify-end gap-3">
				<button
					type="button"
					class="inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					onclick={close_unlisted_info}
				>
					Got it
				</button>
			</div>
		</div>
	{/if}
</dialog>

<dialog
	bind:this={shadowed_info_ref}
	class="m-0 h-screen max-h-none w-screen max-w-none overflow-visible border-0 bg-transparent p-0 backdrop:bg-(--foreground)/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
	oncancel={handle_shadowed_info_cancel}
	onclick={handle_shadowed_info_click}
>
	{#if shadowed_info_item}
		<div
			class="fixed top-1/2 left-1/2 flex max-h-[calc(100dvh-2.5rem)] w-[min(24rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-4 text-(--foreground)"
		>
			<h3 class="m-0 text-base font-medium">
				URL taken by {shadowed_info_item.shadowed_by_language
					? 'a language homepage'
					: 'a markdown page'}
			</h3>
			<p class="m-0 text-sm leading-6 text-(--muted-foreground)">
				{#if shadowed_info_item.shadowed_by_language}
					The homepage for language <code>{shadowed_info_item.slug}</code> is served at
					<code>/{shadowed_info_item.slug}</code>, so this page cannot be reached at its current
					URL. Use this page's actions menu to give it a different Page URL. Its content is still
					stored.
				{:else}
					A markdown page from the repository is served at <code>/{shadowed_info_item.slug}</code>,
					so this page cannot be reached. Give it a different Page URL to make it visible again — or
					ask a developer to remove that markdown page.
				{/if}
			</p>
			<div class="flex justify-end gap-3">
				<button
					type="button"
					class="inline-flex min-h-9 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					onclick={close_shadowed_info}
				>
					Got it
				</button>
			</div>
		</div>
	{/if}
</dialog>

<style>
	.ew-pages-drawer {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.ew-drawer-initial-focus-target {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: 0;
		border: 0;
		opacity: 0;
		pointer-events: none;
	}

	.ew-search-shell {
		position: sticky;
		top: 0;
		z-index: 1;
		margin-inline: -0.4rem;
		padding: 1rem 0 0.5rem;
		background: var(--background);
	}

	.ew-search-input-shell {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		height: 2.75rem;
		padding: 0 0.78rem;
		border: 1px solid var(--stroke);
		border-radius: var(--button-border-radius);
		background: var(--background);
		box-shadow: none;
		cursor: text;
		transition: border-color 150ms ease;
	}

	/* Keep search focus quiet while the result highlight identifies the Enter target. */
	.ew-search-input-shell:focus-within {
		border-color: var(--editing);
	}

	.ew-search-input-icon {
		flex: 0 0 auto;
		width: 1.15rem;
		height: 1.15rem;
		color: var(--muted-foreground);
	}

	.ew-search-input {
		width: 100%;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--foreground);
		padding: 0;
		font-size: 1rem;
		line-height: 1.5rem;
		outline: none;
		box-shadow: none;
		appearance: none;
		-webkit-appearance: none;
	}

	.ew-search-input::placeholder {
		color: var(--muted-foreground);
	}

	.ew-search-input:focus,
	.ew-search-input:focus-visible {
		outline: none;
		border: 0;
		box-shadow: none;
	}

	.ew-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.ew-status-message {
		padding: 0.8rem 0;
		font-size: 0.9rem;
		color: var(--muted-foreground);
	}

	.ew-tree-row-shell {
		position: relative;
	}

	.ew-tree-row {
		position: relative;
		z-index: 1;
		border: 0;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background-color 140ms ease;
		outline: none;
	}

	.ew-tree-row-shell::before {
		content: '';
		position: absolute;
		inset: 0 -0.4rem 0
			max(-0.4rem, calc(var(--tree-guide-columns, 0) * var(--tree-indent-width, 1.3rem) - 0.4rem));
		border-radius: var(--button-border-radius);
		background: transparent;
		pointer-events: none;
		z-index: 0;
		transition: background-color 140ms ease;
	}

	.ew-tree-row-keyboard-selected {
		z-index: 3;
	}

	.ew-tree-row {
		display: flex;
		align-items: center;
		gap: 0;
		width: 100%;
		min-width: 0;
		min-height: 2.75rem;
		padding: 0 2.5rem 0 0;
		z-index: 1;
	}

	.ew-tree-row-meta {
		margin-left: auto;
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.375rem;
		padding-left: 0.75rem;
		padding-right: 1rem;
	}

	.ew-tree-row-root {
		padding-left: 0;
	}

	.ew-tree-row::after {
		content: '';
		position: absolute;
		inset: 0 -0.4rem 0
			max(-0.4rem, calc(var(--tree-guide-columns, 0) * var(--tree-indent-width, 1.3rem) - 0.4rem));
		border-radius: var(--button-border-radius);
		pointer-events: none;
		background: transparent;
		outline: 2px solid transparent;
		outline-offset: -2px;
		z-index: 3;
	}

	.ew-tree-row-shell:hover::before {
		background: var(--muted);
	}

	.ew-tree-row-shell:hover .ew-tree-row-keyboard-selected::before {
		background: var(--editing-muted);
	}

	.ew-tree-row:focus-visible::after,
	.ew-tree-row-shell:focus-within .ew-tree-row:focus-visible::after {
		outline-color: var(--editing);
	}

	.ew-tree-row-keyboard-selected {
		outline: none;
		background: transparent;
	}

	.ew-tree-row-keyboard-selected::before {
		content: '';
		position: absolute;
		inset: 0 -0.4rem 0
			max(-0.4rem, calc(var(--tree-guide-columns, 0) * var(--tree-indent-width, 1.3rem) - 0.4rem));
		border-radius: var(--button-border-radius);
		pointer-events: none;
		background: var(--editing-muted);
		z-index: -1;
	}

	.ew-item-actions-btn {
		position: absolute;
		z-index: 4;
		top: 50%;
		right: -0.15rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		transform: translateY(-50%);
		border: 0;
		border-radius: var(--button-border-radius);
		padding: 0;
		background: transparent;
		color: var(--foreground);
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 2px;
		pointer-events: auto;
		transition:
			background-color 150ms ease,
			transform 150ms ease;
	}

	.ew-tree-actions-dots {
		width: 1.5rem;
		height: 1.5rem;
		color: inherit;
	}

	.ew-item-actions-btn:focus-visible {
		outline-color: var(--editing);
		box-shadow: none;
	}

	.ew-item-actions-btn:active {
		background: color-mix(in srgb, var(--foreground) 10%, transparent);
	}

	.ew-page-illustration {
		display: grid;
		place-items: center;
		background: transparent;
		overflow: hidden;
	}

	.ew-tree-illustration {
		width: 2.25rem;
		aspect-ratio: 1;
		flex: 0 0 auto;
		margin: 0.25rem 0.35rem 0.25rem -0.15rem;
		background: var(--muted);
		border-radius: var(--button-border-radius);
		overflow: hidden;
	}

	.ew-media-preview {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: cover;
		background: var(--muted);
		border-radius: inherit;
		overflow: hidden;
	}

	.ew-page-illustration-fallback {
		width: 100%;
		height: 100%;
		display: grid;
		place-items: center;
		border-radius: inherit;
	}

	.ew-match-highlight {
		background: var(--editing-muted);
		color: inherit;
	}

	.ew-tree {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.ew-tree-node {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.ew-tree-row-shell {
		position: relative;
		display: flex;
		align-items: stretch;
		min-width: 0;
		isolation: isolate;
	}

	.ew-tree-guides {
		position: absolute;
		inset: 0 auto 0 0;
		z-index: 0;
		display: flex;
		align-items: stretch;
		align-self: stretch;
		min-width: max-content;
		margin-left: calc(var(--tree-indent-width, 1.3rem) * -1);
		margin-right: 0;
		pointer-events: none;
	}

	.ew-tree-row {
		position: relative;
		z-index: 1;
		padding-left: calc(var(--tree-guide-columns, 0) * var(--tree-indent-width, 1.3rem));
	}

	.ew-search-shell {
		z-index: 4;
	}

	.ew-tree-guide-column,
	.ew-tree-gutter {
		position: relative;
		width: var(--tree-indent-width, 1.3rem);
		flex: 0 0 var(--tree-indent-width, 1.3rem);
		align-self: stretch;
	}

	.ew-tree-guide-rail,
	.ew-tree-gutter-rail {
		position: absolute;
		left: calc(50% - 0.5px);
		width: 1px;
		background: var(--stroke);
	}

	.ew-tree-guide-rail {
		top: 0;
		bottom: 0;
	}

	.ew-tree-gutter {
		padding: 0;
		border: 0;
		background: transparent;
		cursor: default;
		pointer-events: none;
		overflow: visible;
		min-height: 100%;
	}

	.ew-tree-gutter-rail-top {
		top: 0;
		height: 50%;
	}

	.ew-tree-gutter-rail-bottom {
		top: 50%;
		height: 50%;
	}

	.ew-tree-gutter-elbow {
		position: absolute;
		left: calc(50% - 0.5px);
		top: 50%;
		width: calc(var(--tree-indent-width, 1.3rem) / 2);
		height: 1px;
		background: var(--stroke);
	}

	.ew-tree-label {
		min-width: 0;
		flex: 1 1 auto;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.25rem;
		color: inherit;
		padding-left: 0.75rem;
	}

	.ew-tree-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.ew-unlisted-badge {
		display: inline-flex;
		height: 1.125rem;
		flex: 0 0 auto;
		align-items: center;
		justify-content: center;
		border: 1px solid currentColor;
		border-radius: min(0.25rem, var(--button-border-radius));
		background: transparent;
		color: var(--foreground);
		padding: 0 0.25rem;
		font-size: 10px;
		font-weight: 500;
		line-height: 1;
		letter-spacing: 0.04em;
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 2px;
	}

	/* Red because a shadowed page is broken, not merely undiscoverable. */
	.ew-shadowed-badge {
		color: color-mix(in oklch, red 65%, var(--foreground));
	}

	.ew-unlisted-badge:focus-visible {
		outline-color: var(--editing);
	}

	@media (hover: hover) and (pointer: fine) {
		.ew-item-actions-btn:hover,
		.ew-item-actions-btn:focus-visible {
			background: var(--background);
		}

		.ew-unlisted-badge:hover,
		.ew-unlisted-badge:focus-visible {
			background: var(--muted);
		}
	}

	.ew-tree-children {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.ew-menu-panel {
		position: fixed;
		z-index: 40;
		display: flex;
		flex-direction: column;
		min-width: 11rem;
		margin: 0.5rem 0 0;
		padding: 0.25rem;
		max-width: calc(100vw - 2.5rem);
		max-height: calc(100dvh - 2.5rem);
		overflow-y: auto;
		border: 1px solid var(--stroke);
		border-radius: min(1rem, var(--button-border-radius));
		background: var(--background);
		color: var(--foreground);
		box-shadow: none;
	}

	.ew-menu-item-danger {
		color: color-mix(in oklch, red 65%, var(--foreground));
	}

	@media (max-width: 640px) {
		.ew-search-input-shell {
			gap: 0.5rem;
			padding: 0 0.72rem;
		}

		.ew-search-input-icon {
			width: 1.05rem;
			height: 1.05rem;
		}

		.ew-tree-row-shell:hover::before {
			background: transparent;
		}

		.ew-tree-row-shell:hover .ew-tree-row-keyboard-selected::before {
			background: var(--editing-muted);
		}

		.ew-tree-row-meta {
			display: flex;
			padding-left: 0.5rem;
			padding-right: 0.75rem;
		}

		.ew-item-actions-btn {
			width: 2.25rem;
			padding: 0;
		}

		.ew-item-actions-btn,
		.ew-unlisted-badge {
			background: var(--muted);
		}

		.ew-tree-row-keyboard-selected ~ .ew-item-actions-btn,
		.ew-tree-row-keyboard-selected .ew-unlisted-badge {
			background: var(--background);
		}

		.ew-tree-row-shell {
			--tree-indent-width: 1.3rem;
		}
	}

	@media (min-width: 641px) {
		.ew-tree-row-shell {
			--tree-indent-width: 2.6rem;
		}
	}
</style>
