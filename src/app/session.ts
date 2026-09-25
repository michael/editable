import type { EditorState } from './app_context.js';
import { Session, fill_document_defaults } from 'svedit';
import type { Document } from 'svedit';
import { default_site_document } from './default_site.js';
import { document_config } from './document_config.js';
import { document_schema } from './document_schema.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

export function create_session(
	doc: Document = default_site_document,
	editor_state: EditorState = { allow_structural_changes: true }
): AppSession {
	const document_with_defaults = fill_document_defaults(doc, document_schema);
	return new Session(document_schema, document_with_defaults, {
		...document_config,
		create_commands_and_keymap: (context) =>
			document_config.create_commands_and_keymap(context, editor_state),
		replace_media: (...args: Parameters<typeof document_config.replace_media>) => {
			if (editor_state.allow_structural_changes) return document_config.replace_media(...args);
		},
		handle_media_paste: (...args: Parameters<typeof document_config.handle_media_paste>) => {
			if (editor_state.allow_structural_changes) return document_config.handle_media_paste(...args);
		}
	});
}
