import type { HighlightOptions, highlight_editable_code } from './highlight_editable_code.js';

// Viewers do not need the native-range painter. Keep editing responsive while it loads.
export function lazy_highlight_editable_code(element: HTMLElement, options: HighlightOptions) {
	let current_options = options;
	let action: ReturnType<typeof highlight_editable_code>;
	let loading = false;
	let destroyed = false;

	function start() {
		if (destroyed || loading || action || !current_options.enabled) return;
		if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
		loading = true;
		void import('./highlight_editable_code.js')
			.then(({ highlight_editable_code }) => {
				if (!destroyed && current_options.enabled) {
					action = highlight_editable_code(element, current_options);
				}
			})
			.catch((error) => console.warn('Could not load editable code highlighting', error))
			.finally(() => {
				loading = false;
			});
	}

	start();
	return {
		update(next_options: HighlightOptions) {
			current_options = next_options;
			if (action) action.update(next_options);
			else start();
		},
		destroy() {
			destroyed = true;
			action?.destroy();
		}
	};
}
