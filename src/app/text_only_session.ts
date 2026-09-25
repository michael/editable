import { Session, type Document, type SessionConfig } from 'svedit';
import { document_schema } from './document_schema.js';
import { document_structure } from './translations.js';

/** Application editing policy, independent of why a document is text-only. */
export class TextOnlySession extends Session<typeof document_schema> {
	private readonly structure: string;

	constructor(doc: Document, config: SessionConfig) {
		super(document_schema, doc, { ...config, text_only: true });
		this.structure = document_structure(doc);
	}

	can_insert(): boolean {
		return false;
	}

	apply(...args: Parameters<Session<typeof document_schema>['apply']>): this {
		const [transaction] = args;
		// Rejected operations never enter the document, selection, or undo history.
		if (transaction.ops.length && document_structure(transaction.doc) !== this.structure)
			return this;
		return super.apply(...args);
	}
}
