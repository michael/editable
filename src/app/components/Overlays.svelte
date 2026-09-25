<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import { get_app_context } from '#app/app_context.js';
	import { deserialize_path, serialize_path } from 'svedit';
	import { get_page_browser } from '#app/page_browser_context.svelte.js';
	import MediaControls from './MediaControls.svelte';
	import SizableViewboxControls from './SizableViewboxControls.svelte';
	import EditLink from './EditLink.svelte';
	import EditMedia from './EditMedia.svelte';
	import LinkPreview from './LinkPreview.svelte';
	import AuthDialog from './AuthDialog.svelte';
	import Drawer from './Drawer.svelte';
	import PageUrlDialog from './PageUrlDialog.svelte';
	import PageDeleteDialog from './PageDeleteDialog.svelte';

	const svedit = get_svedit_context();
	const app = get_app_context();

	// True for the whole period the mouse button is down
	let is_mouse_down = $state(false);
	// Only becomes true when the mouse actually moves (=drag)
	let is_dragging = $state(false);

	let overlays_ref = $state<HTMLElement>();
	const page_browser = get_page_browser();

	// --- File drag-and-drop onto media properties ---
	let drop_target_path = $state(null);
	let file_drag_active = $state(false);

	$effect(() => {
		if (!svedit.editable || !app.allow_structural_changes) return;

		document.addEventListener('dragover', on_dragover, true);
		document.addEventListener('dragleave', on_dragleave, true);
		document.addEventListener('drop', on_drop, true);

		return () => {
			document.removeEventListener('dragover', on_dragover, true);
			document.removeEventListener('dragleave', on_dragleave, true);
			document.removeEventListener('drop', on_drop, true);
		};
	});

	function get_media_path_at(e) {
		const el = document.elementFromPoint(e.clientX, e.clientY);
		if (!el) return null;
		const prop_el = el.closest('[data-type="property"]');
		if (!prop_el) return null;
		const path_str = prop_el.getAttribute('data-path');
		if (!path_str) return null;
		const path = deserialize_path(path_str);
		const node = svedit.session.get(path);
		if (node?.type !== 'image' && node?.type !== 'video') return null;
		return path;
	}

	function on_dragover(e) {
		if (!svedit.editable || !app.allow_structural_changes) return;
		if (!e.dataTransfer?.types?.includes('Files')) return;
		file_drag_active = true;
		const path = get_media_path_at(e);
		if (!path) {
			if (drop_target_path) drop_target_path = null;
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = 'copy';
		const path_str = serialize_path(path);
		if (!drop_target_path || serialize_path(drop_target_path) !== path_str) {
			drop_target_path = path;
		}
	}

	function on_dragleave(e) {
		if (!e.relatedTarget && !document.elementFromPoint(e.clientX, e.clientY)) {
			file_drag_active = false;
			drop_target_path = null;
			return;
		}
		if (!drop_target_path) return;
		if (!get_media_path_at(e)) {
			drop_target_path = null;
		}
	}

	async function on_drop(e) {
		if (!app.allow_structural_changes) return;
		const path = drop_target_path ? [...drop_target_path] : null;
		drop_target_path = null;
		file_drag_active = false;

		if (svedit.editable && e.dataTransfer?.types?.includes('Files')) {
			e.preventDefault();
			e.stopPropagation();
		}

		if (!path) return;

		const file = e.dataTransfer?.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;

		const blob_url = URL.createObjectURL(file);
		await svedit.session.config.replace_media(svedit.session, path, file, blob_url);
	}

	function handle_mousemove(e) {
		if (e.buttons !== 1) return;
		if (overlays_ref?.contains(e.target)) return;
		is_dragging = true;
	}

	let selected_property = $derived(
		svedit.session.selection?.type === 'property'
			? svedit.session.get(svedit.session.selection.path)
			: null
	);

	let is_media_selected = $derived(
		selected_property?.type === 'image' || selected_property?.type === 'video'
	);

	let viewbox_context = $derived.by(() => {
		if (!is_media_selected) return null;
		const sel = svedit.session.selection;
		if (!sel) return null;
		const media_path = sel.path;
		const parent_path = media_path.slice(0, -1);
		const media_property = media_path.at(-1) as string;
		const anchor_name = `--viewbox-${serialize_path(parent_path)}-${media_property}`;
		if (document.querySelector(`[data-viewbox-anchor="${anchor_name}"]`)) {
			return { parent_path, media_property };
		}
		return null;
	});

	let link_preview = $derived(get_link_preview());

	function get_link_anchor_path(node, path) {
		// These node wrappers are wider than their visible media frames, so their
		// link UI anchors to the media property instead.
		return ['supporting_media', 'feature'].includes(node.type) ? [...path, 'media'] : path;
	}

	function get_link_preview() {
		const sel = svedit.session.selection;
		if (!sel) return null;

		const selected_node = svedit.session.selected_node;
		if (app.allow_structural_changes && selected_node && 'href' in selected_node) {
			if (sel.type === 'node') {
				const start = Math.min(sel.anchor_offset, sel.focus_offset);
				const end = Math.max(sel.anchor_offset, sel.focus_offset);
				if (end - start === 1) {
					const path = [...sel.path, start];
					return { node: selected_node, path: get_link_anchor_path(selected_node, path) };
				}
			}

			if (sel.type === 'text' || sel.type === 'property') {
				const path = sel.path.slice(0, -1);
				return { node: selected_node, path: get_link_anchor_path(selected_node, path) };
			}
		}

		if (sel.type === 'text') {
			const active_mark = svedit.session.active_mark;
			if (active_mark?.node.type === 'link') {
				const mark_index = active_mark.index;
				const link_node = active_mark.node;
				const path = [...sel.path, 'marks', mark_index, 'node_id'];
				return { node: link_node, path };
			}
		}

		return null;
	}
</script>

<div bind:this={overlays_ref}>
	<!-- Drop target overlay for file drag-and-drop onto media properties -->
	{#if drop_target_path}
		<div
			class="drop-target-overlay"
			style="position-anchor: --{serialize_path(drop_target_path)};"
		></div>
	{/if}

	{#if !file_drag_active && app.allow_structural_changes}
		{#if svedit.session.selection?.type === 'property'}
			{@const anchor_style = `position-anchor: --${serialize_path(svedit.session.selection.path)};`}
			{#if is_media_selected}
				<div class="media-controls-overlay property-selection-overlay" style={anchor_style}></div>
				<!-- Keep controls beside the anchored overlay to avoid Safari positioning bugs. -->
				{#if selected_property.src}
					<MediaControls path={svedit.session.selection.path} {is_mouse_down} {anchor_style} />
				{/if}
			{:else}
				<div class="property-selection-overlay" style={anchor_style}></div>
			{/if}
		{/if}

		{#if viewbox_context}
			<SizableViewboxControls
				path={viewbox_context.parent_path}
				media_property={viewbox_context.media_property as string}
			/>
		{/if}
	{/if}

	{#if link_preview && !svedit.session.commands?.edit_link?.show_prompt && !is_dragging}
		<LinkPreview node={link_preview.node} path={link_preview.path} />
	{/if}

	{#if svedit.session.commands?.toggle_link?.show_prompt}
		<EditLink />
	{:else if link_preview && svedit.session.commands?.edit_link?.show_prompt}
		<EditLink path={link_preview.path} />
	{/if}

	{#if svedit.session.commands?.edit_image?.show_prompt && is_media_selected}
		<EditMedia path={svedit.session.selection.path} />
	{/if}

	{#if app.auth_dialog_open}
		<Drawer
			bind:open={app.auth_dialog_open}
			label="Edit options"
			drawer_height_mode="auto"
			center_content
		>
			<AuthDialog onedit_for_fun={app.edit_for_fun} onlogin_success={app.handle_auth_success} />
		</Drawer>
	{/if}

	{#if app.has_backend && app.is_admin}
		{@const PagesDrawer = (await import('./PagesDrawer.svelte')).default}
		<Drawer bind:open={page_browser.state.open} label="Pages">
			<PagesDrawer />
		</Drawer>
		<PageUrlDialog />
		<PageDeleteDialog />
	{/if}
</div>

<svelte:document
	onmousemove={handle_mousemove}
	onpointerdown={(e) => {
		if (e.pointerType === 'mouse') is_mouse_down = true;
	}}
	onpointerup={() => {
		is_dragging = false;
		is_mouse_down = false;
	}}
/>

<style>
	.drop-target-overlay {
		position: absolute;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		outline: 3px solid var(--editing, oklch(60% 0.22 283));
		outline-offset: -3px;
		pointer-events: none;
		z-index: 30;
	}

	.media-controls-overlay {
		position: absolute;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);
		pointer-events: none;
	}
</style>
