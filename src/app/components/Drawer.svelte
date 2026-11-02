<script lang="ts">
	/**
	 * Reusable bottom drawer / bottom sheet backed by a dialog element so it
	 * participates in the browser top layer when open.
	 *
	 * Usage:
	 * - Provide content via the `children` snippet
	 * - Bind `open` from the parent
	 * - `label` names it for screen readers, announced as it opens: what it is for, such as Pages
	 * - Optional `center_content` centers short content in the drawer's min height
	 */

	let {
		open = $bindable(),
		label,
		drawer_height_mode = 'manual',
		center_content = false,
		children
	} = $props();

	const min_drawer_height_ratio = 0;
	const max_drawer_height_ratio = 0.95;
	const default_drawer_height_ratio = 2 / 3;
	const snap_drawer_height_ratios = [3 / 4, 2 / 3, 1 / 3, 0];
	const velocity_threshold = 0.5;
	const auto_close_drag_distance = 96;

	let dialog_ref = $state<HTMLDialogElement>();
	let handle_ref = $state<HTMLElement>();

	let is_mounted = $state(false);
	let is_closing = $state(false);
	let is_dragging = $state(false);

	let drawer_height_ratio = $state(default_drawer_height_ratio);
	let last_open_drawer_height_ratio = $state(default_drawer_height_ratio);

	let drag_start_y = $state(0);
	let drag_start_height_ratio = $state(default_drawer_height_ratio);
	let drag_offset_y = $state(0);
	let last_pointer_y = $state(0);
	let last_pointer_time = $state(0);
	let drag_velocity = $state(0);

	function clamp_drawer_height_ratio(value) {
		return Math.min(Math.max(value, min_drawer_height_ratio), max_drawer_height_ratio);
	}

	function get_nearest_snap_drawer_height_ratio(value) {
		let nearest_ratio = snap_drawer_height_ratios[0];
		let nearest_distance = Math.abs(value - nearest_ratio);

		for (const snap_ratio of snap_drawer_height_ratios) {
			const distance = Math.abs(value - snap_ratio);
			if (distance < nearest_distance) {
				nearest_ratio = snap_ratio;
				nearest_distance = distance;
			}
		}

		return nearest_ratio;
	}

	function get_snap_drawer_height_ratio(value, velocity) {
		if (Math.abs(velocity) > velocity_threshold) {
			if (velocity > 0) {
				return snap_drawer_height_ratios.find((ratio) => ratio < value) ?? 0;
			}

			return (
				[...snap_drawer_height_ratios].reverse().find((ratio) => ratio > value) ??
				snap_drawer_height_ratios[0]
			);
		}

		return get_nearest_snap_drawer_height_ratio(value);
	}

	function close() {
		if (is_closing) return;

		is_dragging = false;
		is_closing = true;
		is_mounted = false;
	}

	function handle_dialog_cancel(event) {
		event.preventDefault();
		close();
	}

	function handle_backdrop_click(event) {
		if (event.target === dialog_ref) {
			close();
		}
	}

	function handle_handle_pointerdown(event) {
		event.preventDefault();

		is_dragging = true;
		drag_start_y = event.clientY;
		drag_start_height_ratio = drawer_height_ratio;
		drag_offset_y = 0;
		last_pointer_y = event.clientY;
		last_pointer_time = Date.now();
		drag_velocity = 0;

		handle_ref?.setPointerCapture(event.pointerId);
	}

	function handle_handle_pointermove(event) {
		if (!is_dragging) return;

		const now = Date.now();
		const delta_time = now - last_pointer_time;
		const delta_y = event.clientY - last_pointer_y;

		if (delta_time > 0) {
			drag_velocity = delta_y / delta_time;
		}

		last_pointer_y = event.clientY;
		last_pointer_time = now;

		const drag_delta = event.clientY - drag_start_y;

		if (drawer_height_mode === 'auto') {
			drag_offset_y = Math.max(drag_delta, 0);
			return;
		}

		const viewport_height = window.innerHeight || 1;
		const height_delta = drag_delta / viewport_height;
		drawer_height_ratio = clamp_drawer_height_ratio(drag_start_height_ratio - height_delta);
	}

	function finish_drag(event) {
		if (!is_dragging) return;

		is_dragging = false;
		handle_ref?.releasePointerCapture(event.pointerId);

		const viewport_height = window.innerHeight || 1;
		const drag_delta = event.clientY - drag_start_y;

		if (drawer_height_mode === 'auto') {
			const released_drag_offset_y = Math.max(drag_delta, 0);
			drag_velocity = 0;
			drag_offset_y = 0;

			if (released_drag_offset_y >= auto_close_drag_distance) {
				close();
				return;
			}

			return;
		}

		const released_height_ratio = clamp_drawer_height_ratio(
			drag_start_height_ratio - drag_delta / viewport_height
		);

		const snap_target = get_snap_drawer_height_ratio(released_height_ratio, drag_velocity);
		drag_velocity = 0;

		if (snap_target <= 0) {
			close();
			return;
		}

		drawer_height_ratio = snap_target;
		last_open_drawer_height_ratio = snap_target;
	}

	function handle_handle_pointerup(event) {
		finish_drag(event);
	}

	function handle_handle_pointercancel(event) {
		finish_drag(event);
	}

	function handle_drawer_transition_end(event) {
		if (event.target !== event.currentTarget) return;
		if (event.propertyName !== 'transform') return;

		if (!is_mounted && dialog_ref?.open) {
			dialog_ref.close();
			is_closing = false;
			open = false;
			drawer_height_ratio = last_open_drawer_height_ratio;
			drag_offset_y = 0;
		}
	}

	$effect(() => {
		if (!dialog_ref) return;

		if (open) {
			document.documentElement.classList.add('ew-drawer-open');
			document.body.classList.add('ew-drawer-open');

			is_closing = false;
			drawer_height_ratio = last_open_drawer_height_ratio;

			if (!dialog_ref.open) {
				dialog_ref.showModal();
			}

			requestAnimationFrame(() => {
				is_mounted = true;
			});
		} else {
			document.documentElement.classList.remove('ew-drawer-open');
			document.body.classList.remove('ew-drawer-open');

			if (dialog_ref.open && !is_closing) {
				is_mounted = false;
				is_closing = true;
			}
		}

		return () => {
			document.documentElement.classList.remove('ew-drawer-open');
			document.body.classList.remove('ew-drawer-open');
		};
	});
</script>

<dialog
	bind:this={dialog_ref}
	aria-label={label}
	class="ew-drawer-dialog"
	class:ew-mounted={is_mounted}
	class:ew-closing={is_closing}
	class:ew-dragging={is_dragging}
	oncancel={handle_dialog_cancel}
	onclick={handle_backdrop_click}
>
	<div
		class="ew-drawer-shell"
		style={drawer_height_mode === 'manual'
			? `--drawer-height: ${drawer_height_ratio * 100}dvh;`
			: undefined}
	>
		<div
			class="ew-drawer"
			class:ew-auto-dragging={drawer_height_mode === 'auto' && is_dragging}
			ontransitionend={handle_drawer_transition_end}
			style={drawer_height_mode === 'auto' && is_dragging
				? `--auto-drag-offset: ${drag_offset_y}px;`
				: undefined}
		>
			<div
				class="ew-drawer-handle-area"
				bind:this={handle_ref}
				role="presentation"
				aria-hidden="true"
				onpointerdown={handle_handle_pointerdown}
				onpointermove={handle_handle_pointermove}
				onpointerup={handle_handle_pointerup}
				onpointercancel={handle_handle_pointercancel}
			>
				<span class="ew-drawer-handle" aria-hidden="true"></span>
			</div>

			<div
				class:ew-drawer-panel-auto={drawer_height_mode === 'auto'}
				class="ew-drawer-panel focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
			>
				<div class="ew-drawer-content" class:ew-drawer-content-centered={center_content}>
					{@render children?.({ close })}
				</div>
			</div>
		</div>
	</div>
</dialog>

<style>
	.ew-drawer-dialog {
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

	/* Hide the page scrollbar so it does not sit next to the drawer's own one.
	   Pointer-scoped on purpose: on touch WebKit, hiding the root scrollbar
	   permanently suppresses the scroll indicator — it does not come back when the
	   class is removed. Those platforms draw scrollbars as overlays anyway, so
	   there is no second scrollbar to hide. */
	@media (hover: hover) and (pointer: fine) {
		:global(html.ew-drawer-open),
		:global(body.ew-drawer-open) {
			scrollbar-width: none;
			-ms-overflow-style: none;
		}

		:global(html.ew-drawer-open::-webkit-scrollbar),
		:global(body.ew-drawer-open::-webkit-scrollbar) {
			display: none;
			width: 0;
			height: 0;
		}
	}

	.ew-drawer-dialog::backdrop {
		background: transparent;
		opacity: 0;
		transition: opacity 0.2s ease-out;
	}

	.ew-drawer-dialog[open].ew-mounted::backdrop {
		background: color-mix(in oklch, var(--foreground) 16%, transparent);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
		opacity: 1;
	}

	.ew-drawer-shell {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}

	.ew-drawer-handle-area {
		position: absolute;
		left: 0;
		right: 0;
		top: -2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: auto;
		cursor: ns-resize;
		touch-action: none;
		z-index: 2;
	}

	.ew-drawer-dialog.ew-dragging .ew-drawer-handle-area {
		cursor: ns-resize;
	}

	.ew-drawer-handle {
		display: block;
		width: 2.5rem;
		height: 0.32rem;
		background: var(--background);
		border-radius: var(--button-border-radius);
		border: 1px solid var(--stroke);
	}

	.ew-drawer {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		transform: translateY(100%);
		transition:
			transform 250ms cubic-bezier(0.32, 0.72, 0, 1),
			height 250ms cubic-bezier(0.32, 0.72, 0, 1);
		will-change: transform;
	}

	.ew-drawer-dialog.ew-mounted .ew-drawer {
		transform: translateY(0);
	}

	.ew-drawer-dialog.ew-mounted .ew-drawer.ew-auto-dragging {
		transform: translateY(var(--auto-drag-offset));
	}

	.ew-drawer-dialog.ew-closing .ew-drawer {
		transform: translateY(100%);
		transition:
			transform 150ms cubic-bezier(0.32, 0, 0.67, 0),
			height 150ms cubic-bezier(0.32, 0, 0.67, 0);
	}

	.ew-drawer-dialog.ew-dragging .ew-drawer {
		transition: none;
	}

	.ew-drawer-panel {
		width: 100%;
		height: var(--drawer-height);
		max-height: 95dvh;
		background: var(--background);
		border-top: 1px solid var(--stroke);
		color: var(--foreground);
		padding-bottom: env(safe-area-inset-bottom);
		overflow: auto;
		overscroll-behavior: contain;
		pointer-events: auto;
	}

	.ew-drawer-panel-auto {
		height: auto;
		min-height: 0;
		overflow: visible;
	}

	.ew-drawer-content {
		width: 100%;
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 1.25rem 1.25rem;
		min-height: 12rem;
	}

	/* Content shorter than the min height sits in the middle instead of the top.
	   Symmetric padding so the centering is not pulled up by the bottom inset. */
	.ew-drawer-content-centered {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding-top: 1.25rem;
	}

	@media (min-width: 640px) {
		.ew-drawer-content {
			padding-left: 1.75rem;
			padding-right: 1.75rem;
		}
	}

	@media (min-width: 768px) {
		.ew-drawer-content {
			padding-left: 2.5rem;
			padding-right: 2.5rem;
		}
	}

	@media (min-width: 1024px) {
		.ew-drawer-content {
			padding-left: 3.5rem;
			padding-right: 3.5rem;
		}
	}
</style>
