import { TextOnlySession } from './text_only_session.js';
import { Session, fill_document_defaults } from 'svedit';
import type { Document } from 'svedit';
import { default_site_document } from './default_site.js';
import { document_config } from './document_config.js';
import { document_schema } from './document_schema.js';

/** The app's concrete schema-typed session type. */
export type AppSession = Session<typeof document_schema>;

export function create_session(
	doc: Document = default_site_document,
	text_only = false
): AppSession {
	const document_with_defaults = fill_document_defaults(doc, document_schema);
	return text_only
		? new TextOnlySession(document_with_defaults, document_config)
		: new Session(document_schema, document_with_defaults, document_config);
}
