import { getContext, type Snippet } from 'svelte';

/** Live editor capabilities, exposed through reactive getters. */
export type EditorState = {
	readonly allow_structural_changes: boolean;
};

/** App state and handlers provided by App.svelte. */
export type AppContext = EditorState & {
	readonly languages: string[];
	readonly language: string;
	readonly translation_mode: boolean;
	readonly has_unsaved_changes: boolean;
	readonly saving: boolean;
	readonly canonical_path: string | null;
	switch_language: (language: string, action?: 'save' | 'discard') => Promise<void>;
	/** Optional body for read-only routes using the shared site layout. */
	readonly page_content?: Snippet;
	readonly has_backend: boolean;
	readonly can_edit: boolean;
	readonly is_demo_mode: boolean;
	readonly is_admin: boolean;
	readonly origin: string | null;
	readonly document_title: string | null;
	readonly slug: string | null;
	readonly is_new: boolean;
	auth_dialog_open: boolean;
	close_auth_dialog: () => void;
	edit_for_fun: () => void;
	handle_auth_success: () => Promise<void>;
};

/**
 * Typed accessor for the app context. Use inside components rendered under
 * App.svelte instead of `getContext('app')`.
 */
export function get_app_context(): AppContext {
	return getContext('app') as AppContext;
}
