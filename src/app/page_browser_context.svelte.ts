import { createContext } from 'svelte';
import type { PageTreeNode } from '#app/api.remote.js';

export type PageBrowser = ReturnType<typeof create_page_browser> & {
	/** Reactive data version, installed by App.svelte (bumped on invalidation). */
	version?: number;
	/** Refetches page browser data, installed by App.svelte. */
	invalidate?: () => void;
};

export const [get_page_browser, set_page_browser] = createContext<PageBrowser>();

export function create_page_browser(options: {
	goto: (href: string) => Promise<void> | void;
	is_admin: () => boolean;
}) {
	const { goto, is_admin } = options;

	const state = $state({
		open: false,
		mode: 'navigate' as 'navigate' | 'select',
		on_select_page: null as ((page: PageTreeNode) => void) | null
	});

	function reset() {
		state.open = false;
		state.mode = 'navigate';
		state.on_select_page = null;
	}

	function open_navigate() {
		if (!is_admin()) return;
		state.mode = 'navigate';
		state.on_select_page = null;
		state.open = true;
	}

	function open_select(on_select_page: (page: PageTreeNode) => void) {
		if (!is_admin()) return;
		state.mode = 'select';
		state.on_select_page = on_select_page;
		state.open = true;
	}

	function close() {
		reset();
	}

	function handle_page_selected(page: PageTreeNode) {
		if (state.mode === 'select' && state.on_select_page) {
			state.on_select_page(page);
			reset();
			return;
		}

		reset();
		if (page?.page_href) {
			void goto(page.navigation_href ?? page.page_href);
		}
	}

	return {
		get state() {
			return state;
		},
		open_navigate,
		open_select,
		close,
		handle_page_selected
	};
}
