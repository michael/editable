import { backend } from './services.js';
import { collect_asset_ids, translation_payloads } from '#lib/asset_references.js';
import { ASSET_ID_REGEX } from './config.js';
import { ASSET_GRACE_PERIOD_DAYS } from './server_config.js';

/** Record the assets a document and all its translations refer to, atomically with saves. */
export async function rebuild_asset_refs(document_id: string) {
	const record = await backend.documents.get(document_id);
	if (!record) {
		await backend.asset_refs.delete(document_id);
		return;
	}
	const payloads = [
		record.data,
		...(await backend.translations.all())
			.filter((row) => row.document_id === document_id)
			.flatMap((row) => [...translation_payloads(JSON.parse(row.value))])
	];
	await backend.asset_refs.put({ document_id, asset_ids: [...collect_asset_ids(payloads)] });
}

/** Every asset any document refers to, from the references kept per document. */
export async function referenced_asset_ids(): Promise<Set<string>> {
	return new Set((await backend.asset_refs.all()).flatMap((record) => record.asset_ids));
}

/**
 * Delete asset originals no document refers to once their grace period, which
 * runs from when they were last written or touched, has passed. Returns how
 * many were deleted.
 */
export async function delete_orphaned_assets(referenced: Set<string>): Promise<number> {
	const grace_period_ms = ASSET_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
	let deleted = 0;
	for (const { asset_id, last_used } of await backend.list_assets()) {
		if (!ASSET_ID_REGEX.test(asset_id) || referenced.has(asset_id)) continue;
		if (Date.now() - last_used < grace_period_ms) continue;
		await backend.delete_asset(asset_id);
		deleted++;
	}
	return deleted;
}
