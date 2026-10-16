import { store } from './services.js';
import { collect_asset_ids, translation_payloads } from '#lib/asset_references.js';

/** Record the assets a document and all its translations refer to, atomically with saves. */
export function rebuild_asset_refs(document_id: string) {
	const record = store.documents.get(document_id);
	if (!record) {
		store.asset_refs.delete(document_id);
		return;
	}
	const payloads = [
		record.data,
		...store.translations
			.all()
			.filter((row) => row.document_id === document_id)
			.flatMap((row) => [...translation_payloads(JSON.parse(row.value))])
	];
	store.asset_refs.put(document_id, { document_id, asset_ids: [...collect_asset_ids(payloads)] });
}

/** Every asset any document refers to, from the references kept per document. */
export function referenced_asset_ids(): Set<string> {
	return new Set(store.asset_refs.all().flatMap((record) => record.asset_ids));
}
