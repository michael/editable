import { is_media_property } from './translations.js';
import type { AppContext } from './app_context.js';
import { Session, fill_document_defaults } from 'svedit';
import type { Document } from 'svedit';
import { default_site_document } from './default_site.js';
import { document_config } from './document_config.js';
import { document_schema } from './document_schema.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

export function create_session(
	doc: Document = default_site_document,
	app: Pick<AppContext, 'allow_structural_changes'> = { allow_structural_changes: true }
): AppSession {
	const document_with_defaults = fill_document_defaults(doc, document_schema);
	return new Session(document_schema, document_with_defaults, {
		...document_config,
		create_commands_and_keymap: (context) =>
			document_config.create_commands_and_keymap({
				get session() {
					return context.session;
				},
				get editable() {
					return context.editable;
				},
				get allow_structural_changes() {
					return app.allow_structural_changes;
				}
			}),
		handle_property_deletion: (tr, path) =>
			document_config.handle_property_deletion(tr, path, !app.allow_structural_changes),
		replace_media: (...args: Parameters<typeof document_config.replace_media>) => {
			const [session, path, file, blob_url] = args;
			if (app.allow_structural_changes || is_media_property(session.inspect(path))) {
				return document_config.replace_media(
					session,
					path,
					file,
					blob_url,
					!app.allow_structural_changes
				);
			}
		},
		handle_media_paste: (...args: Parameters<typeof document_config.handle_media_paste>) => {
			if (app.allow_structural_changes) return document_config.handle_media_paste(...args);
			const [session, media] = args;
			if (
				session.selection?.type === 'property' &&
				media.length &&
				is_media_property(session.inspect(session.selection.path))
			) {
				return document_config.replace_media(
					session,
					session.selection.path,
					media[0].blob,
					media[0].data_url,
					true
				);
			}
		}
	});
}
