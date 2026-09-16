import { getContext, type Snippet } from 'svelte';

/**
 * The app-level context provided by App.svelte: server-derived flags plus
 * the auth dialog state and its handlers.
 */
export type AppContext = {
	/** Optional body for read-only routes using the shared site layout. */
	readonly page_content?: Snippet;
	readonly has_backend: boolean;
	readonly can_edit: boolean;
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
