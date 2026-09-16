type TooltipOptions = { label: string; keys?: string[] };

let tooltip_id = 0;

const key_names: Record<string, string> = {
	'⌘': 'Command',
	'⌃': 'Control',
	'⇧': 'Shift',
	'⌥': 'Option',
	'⎋': 'Escape',
	'↵': 'Enter',
	'⏎': 'Enter',
	'⌫': 'Backspace'
};

/** A tooltip in the top layer, so scrolling toolbars cannot clip it. */
export function tooltip(trigger: HTMLElement, options: TooltipOptions) {
	const popup = document.createElement('div');
	popup.id = `ew-tooltip-${++tooltip_id}`;
	popup.popover = 'manual';
	popup.role = 'tooltip';
	popup.className = 'ew-tooltip';
	trigger.after(popup);

	const original_description = trigger.getAttribute('aria-describedby');
	trigger.setAttribute(
		'aria-describedby',
		[original_description, popup.id].filter(Boolean).join(' ')
	);
	let open_timer: ReturnType<typeof setTimeout>;
	let close_timer: ReturnType<typeof setTimeout>;
	let hovered = false;
	let focused = false;
	const events = new AbortController();
	const listener_options = { signal: events.signal };

	function render(next: TooltipOptions) {
		popup.replaceChildren();
		const label = document.createElement('span');
		label.textContent = next.label;
		popup.append(label);
		if (next.keys?.length) {
			const shortcut = document.createElement('span');
			shortcut.className = 'inline-flex gap-1';
			const shortcut_description = document.createElement('span');
			shortcut_description.className = 'sr-only';
			shortcut_description.textContent = ` ${next.keys.map((key) => key_names[key] ?? key).join(' + ')}`;
			shortcut.append(shortcut_description);
			for (const key of next.keys) {
				const keycap = document.createElement('kbd');
				keycap.className = 'ew-shortcut-key';
				keycap.textContent = key;
				keycap.setAttribute('aria-hidden', 'true');
				shortcut.append(keycap);
			}
			popup.append(shortcut);
		}
	}

	function hide() {
		clearTimeout(open_timer);
		clearTimeout(close_timer);
		if (popup.matches(':popover-open')) popup.hidePopover();
	}

	function show() {
		clearTimeout(close_timer);
		if (popup.matches(':popover-open')) return;
		popup.showPopover();
		const rect = trigger.getBoundingClientRect();
		const width = popup.offsetWidth;
		const height = popup.offsetHeight;
		popup.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - 8))}px`;
		popup.style.top = `${rect.top >= height + 16 ? rect.top - height - 8 : rect.bottom + 8}px`;
	}

	function leave() {
		clearTimeout(open_timer);
		// Allow crossing the gap between the trigger and tooltip.
		close_timer = setTimeout(() => {
			if (!hovered && !focused) hide();
		}, 120);
	}

	trigger.addEventListener(
		'pointerenter',
		(event) => {
			if (event.pointerType === 'touch') return;
			hovered = true;
			clearTimeout(close_timer);
			open_timer = setTimeout(show, 400);
		},
		listener_options
	);
	trigger.addEventListener(
		'pointerleave',
		() => {
			hovered = false;
			leave();
		},
		listener_options
	);
	trigger.addEventListener(
		'focus',
		() => {
			focused = trigger.matches(':focus-visible');
			if (focused) show();
		},
		listener_options
	);
	trigger.addEventListener(
		'blur',
		() => {
			focused = false;
			leave();
		},
		listener_options
	);
	trigger.addEventListener('pointerdown', hide, listener_options);
	trigger.addEventListener('click', hide, listener_options);
	popup.addEventListener(
		'pointerenter',
		() => {
			hovered = true;
			clearTimeout(close_timer);
		},
		listener_options
	);
	popup.addEventListener(
		'pointerleave',
		() => {
			hovered = false;
			leave();
		},
		listener_options
	);
	document.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Escape' && popup.matches(':popover-open')) {
				event.stopImmediatePropagation();
				event.preventDefault();
				hide();
			}
		},
		{ ...listener_options, capture: true }
	);
	document.addEventListener('scroll', hide, { ...listener_options, capture: true, passive: true });
	window.addEventListener('resize', hide, listener_options);
	render(options);

	return {
		update: render,
		destroy() {
			hide();
			events.abort();
			popup.remove();
			if (original_description === null) trigger.removeAttribute('aria-describedby');
			else trigger.setAttribute('aria-describedby', original_description);
		}
	};
}
