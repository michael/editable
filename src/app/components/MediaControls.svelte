<script lang="ts">
	import { get_app_context } from '#app/app_context.js';
	import { update_media } from '#app/media_translation.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { touch_drag } from '#lib/client/touch_drag.js';

	const svedit = get_svedit_context();
	const app = get_app_context();

	// Zoom constraints
	const MIN_SCALE = 0.1;
	const MAX_SCALE = 5.0;
	const ZOOM_STEP = 0.05;

	let { path, is_mouse_down, anchor_style } = $props();

	let media_node = $derived(svedit.session.get(path));
	let controls_ref = $state(null);
	// Panning control — disable only when the media exactly fills the container
	// with no room to move: cover at scale 1.0 with matching aspect ratios.
	// All other cases (contain, scale > 1, mismatched ratios) allow panning.
	let can_pan = $state(false);
	let container_width = $state(0);
	let container_height = $state(0);

	// Track last pointer position for delta computation
	let last_x = 0;
	let last_y = 0;

	// Two-step arm mode:
	// 1) Initial click/drag should be pure DOM selection (no panning).
	// 2) After pointerup with stable property selection, arm panning for next drag.
	let pan_mode_armed = $state(false);

	// ResizeObserver tracks actual container dimensions (covers aspect ratio
	// changes, max-width changes, window resizes, etc.)
	$effect(() => {
		const el = controls_ref;
		if (!el) return;

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				container_width = entry.contentRect.width;
				container_height = entry.contentRect.height;
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// Derive can_pan from media props + observed container dimensions
	$effect(() => {
		const _scale = media_node.scale;
		const _width = media_node.width;
		const _height = media_node.height;
		const cw = container_width;
		const ch = container_height;

		if (!controls_ref || !_width || !_height || cw === 0 || ch === 0) {
			can_pan = false;
			return;
		}

		if (_scale !== 1.0) {
			can_pan = true;
			return;
		}

		// At scale 1.0, panning is only useful if aspect ratios differ:
		// - cover: image overflows on one axis, focal point picks visible area
		// - contain: image has empty space, focal point positions it in the frame
		const container_ratio = cw / ch;
		const media_ratio = _width / _height;
		can_pan = Math.abs(media_ratio - container_ratio) > 0.01;
	});

	function apply_pan_delta(client_x, client_y) {
		const rect = controls_ref.getBoundingClientRect();
		const dx = ((client_x - last_x) / rect.width) * -1;
		const dy = ((client_y - last_y) / rect.height) * -1;

		const new_focal_point_x = Math.min(Math.max(media_node.focal_point_x - dx, 0), 1);
		const new_focal_point_y = Math.min(Math.max(media_node.focal_point_y - dy, 0), 1);

		const tr = svedit.session.tr;
		update_media(
			tr,
			path,
			{ focal_point_x: new_focal_point_x, focal_point_y: new_focal_point_y },
			app.translation_mode
		);
		svedit.session.apply(tr, { batch: true });

		last_x = client_x;
		last_y = client_y;
	}

	function handle_double_click() {
		const tr = svedit.session.tr;
		update_media(
			tr,
			path,
			{ scale: 1.0, object_fit: media_node.object_fit === 'cover' ? 'contain' : 'cover' },
			app.translation_mode
		);
		svedit.session.apply(tr, { batch: true });
	}

	function handle_wheel(e) {
		// Only zoom when meta (Cmd) or ctrl key is held, otherwise let the page scroll
		if (!e.metaKey && !e.ctrlKey) return;
		e.preventDefault();
		const zoom_delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;

		const current_scale = media_node.scale;
		const next_scale = current_scale + zoom_delta;
		const crosses_one =
			(current_scale < 1.0 && next_scale > 1.0) || (current_scale > 1.0 && next_scale < 1.0);
		const is_close_to_one = Math.abs(next_scale - 1.0) <= ZOOM_STEP;

		const snapped_scale = crosses_one || is_close_to_one ? 1.0 : next_scale;

		const tr = svedit.session.tr;
		update_media(
			tr,
			path,
			{ scale: Math.min(Math.max(snapped_scale, MIN_SCALE), MAX_SCALE) },
			app.translation_mode
		);
		svedit.session.apply(tr, { batch: true });
	}

	function handle_pointer_down(e: PointerEvent) {
		// The controls cover the selected property and intercept its native click.
		// Keep focus on the canvas so Svedit can restore its native selection.
		if (e.pointerType !== 'touch') e.preventDefault();
		if (!svedit.canvas_focused) svedit.focus_canvas();
	}

	const pan_drag = touch_drag({
		should_start: () => can_pan,
		on_down(client_x, client_y) {
			last_x = client_x;
			last_y = client_y;
		},
		on_move(client_x, client_y) {
			if (!can_pan) return;
			apply_pan_delta(client_x, client_y);
		}
	});
</script>

<!-- Either the pan mode is armed (after a pointer selection) or there's no pointer involved -->
{#if pan_mode_armed || !is_mouse_down}
	<div
		bind:this={controls_ref}
		class="media-controls"
		style={anchor_style}
		oncontextmenu={(e) => e.preventDefault()}
		onpointerdowncapture={handle_pointer_down}
		ondblclick={handle_double_click}
		onwheel={handle_wheel}
		{@attach pan_drag}
		role="button"
		tabindex="0"
	>
		{#if can_pan}
			<div
				class="marker"
				style={`left: ${media_node.focal_point_x * 100}%; top: ${media_node.focal_point_y * 100}%;`}
			></div>
		{/if}
	</div>
{/if}

<style>
	.media-controls {
		position: absolute;
		top: anchor(top);
		left: anchor(left);
		bottom: anchor(bottom);
		right: anchor(right);

		pointer-events: auto;
		cursor: grab;
		z-index: 10;
	}

	.media-controls:global(.dragging) {
		cursor: grabbing;
	}

	.media-controls:global(.touch-locked) {
		outline: 2px solid var(--editing, oklch(60% 0.22 283));
		outline-offset: -2px;
	}

	.marker {
		position: absolute;
		width: max(5%, 20px);
		max-width: 20%;
		aspect-ratio: 1/1;
		transform: translate(-50%, -50%);
		pointer-events: none;
		mix-blend-mode: difference;
		border: 1px solid var(--editing);
		border-radius: 50%;
	}

	/* Center crosshair - horizontal line */
	.marker::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 150%;
		height: 1px;
		background: var(--editing);
		transform: translate(-50%, -50%);
	}

	/* Center crosshair - vertical line */
	.marker::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 1px;
		height: 150%;
		background: var(--editing);
		transform: translate(-50%, -50%);
	}
</style>
