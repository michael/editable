import type { Attachment } from 'svelte/attachments';

// --- Global cursor lock ---
// Injects a single shared <style> into <head> that forces a cursor on every
// element via `!important`.  Used by drag handles and pan controls so the
// cursor stays locked even when the pointer leaves the drag zone.

let _cursor_style: HTMLStyleElement | null = null;

/**
 * Lock the cursor globally to the given CSS cursor value (e.g. 'ew-resize', 'grabbing').
 */
export function lock_cursor(cursor: string) {
	if (!_cursor_style) {
		_cursor_style = document.createElement('style');
		document.head.appendChild(_cursor_style);
	}
	_cursor_style.textContent = `* { cursor: ${cursor} !important; }`;
}

/** Remove the global cursor lock. */
export function unlock_cursor() {
	if (_cursor_style) {
		_cursor_style.remove();
		_cursor_style = null;
	}
}

/**
 * Touch-aware drag attachment.
 *
 * Mouse/pen: drag starts immediately on pointerdown.
 * Touch: user must hold still for 300ms before drag activates
 * (disambiguates from page scroll).
 *
 * Toggles CSS classes on the element automatically:
 *   .ew-dragging     — while actively dragging (mouse or touch)
 *   .ew-touch-locked — once the touch hold threshold passes
 *
 * Usage:
 *
 *   <div {@attach touch_drag({ on_move, on_down, on_up })}>
 */
export function touch_drag(callbacks: {
	should_start?: () => boolean;
	on_down?: (client_x: number, client_y: number) => void;
	on_move: (client_x: number, client_y: number) => void;
	on_up?: () => void;
}): Attachment<HTMLElement> {
	const HOLD_MS = 300;
	const MOVE_TOL = 8;

	return (node: HTMLElement) => {
		let dragging = false;
		let locked = false;
		let timer: ReturnType<typeof setTimeout> | null = null;
		let start_x = 0;
		let start_y = 0;

		function set_dragging(v: boolean) {
			dragging = v;
			node.classList.toggle('ew-dragging', v);
		}

		function set_locked(v: boolean) {
			locked = v;
			node.classList.toggle('ew-touch-locked', v);
		}

		function can_start() {
			return !callbacks.should_start || callbacks.should_start();
		}

		function end_drag() {
			const was = dragging;
			clear_timer();
			set_locked(false);
			set_dragging(false);
			if (was) callbacks.on_up?.();
		}

		function clear_timer() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		}

		// --- Pointer (mouse / pen — immediate) ---

		function on_pointer_down(e: PointerEvent) {
			if (e.pointerType === 'touch' || !can_start()) return;
			e.preventDefault();
			e.stopPropagation();
			set_dragging(true);
			callbacks.on_down?.(e.clientX, e.clientY);
		}

		function on_pointer_move(e: PointerEvent) {
			if (e.pointerType === 'touch' || !dragging) return;
			callbacks.on_move(e.clientX, e.clientY);
		}

		function on_pointer_up(e: PointerEvent) {
			if (e?.pointerType === 'touch' || !dragging) return;
			set_dragging(false);
			callbacks.on_up?.();
		}

		// --- Touch (hold-then-drag) ---

		function on_touch_start(e: TouchEvent) {
			if (e.touches.length !== 1 || !can_start()) return;
			const t = e.touches[0];
			start_x = t.clientX;
			start_y = t.clientY;
			clear_timer();
			timer = setTimeout(() => {
				timer = null;
				set_locked(true);
				set_dragging(true);
				callbacks.on_down?.(start_x, start_y);
			}, HOLD_MS);
		}

		function on_touch_move(e: TouchEvent) {
			if (e.touches.length !== 1) {
				end_drag();
				return;
			}
			const t = e.touches[0];
			if (!locked) {
				if (
					timer &&
					(Math.abs(t.clientX - start_x) > MOVE_TOL || Math.abs(t.clientY - start_y) > MOVE_TOL)
				) {
					clear_timer();
				}
				return;
			}
			e.preventDefault();
			callbacks.on_move(t.clientX, t.clientY);
		}

		// --- Bind ---

		node.addEventListener('pointerdown', on_pointer_down);
		node.addEventListener('touchstart', on_touch_start, { passive: true });
		node.addEventListener('touchmove', on_touch_move, { passive: false });
		node.addEventListener('touchend', end_drag);
		node.addEventListener('touchcancel', end_drag);
		window.addEventListener('pointermove', on_pointer_move);
		window.addEventListener('pointerup', on_pointer_up);

		return () => {
			end_drag();
			node.removeEventListener('pointerdown', on_pointer_down);
			node.removeEventListener('touchstart', on_touch_start);
			node.removeEventListener('touchmove', on_touch_move);
			node.removeEventListener('touchend', end_drag);
			node.removeEventListener('touchcancel', end_drag);
			window.removeEventListener('pointermove', on_pointer_move);
			window.removeEventListener('pointerup', on_pointer_up);
		};
	};
}
