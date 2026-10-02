import type { Document } from 'svedit';
import {
	prepare_translation,
	remove_unreferenced,
	type TranslationPayload
} from '../translations.js';

/** Apply a single translation to a test document. */
export function replace_translation(
	doc: Document,
	node_id: string,
	property_id: string,
	payload: TranslationPayload
) {
	const replacement = prepare_translation(doc, node_id, property_id, payload);
	Object.assign(doc.nodes, replacement.nodes);
	remove_unreferenced(doc, replacement.removed_ids);
}
