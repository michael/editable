import { backend } from './services.js';
import { collect_asset_ids, translation_payloads } from '#lib/asset_references.js';
import type { Document } from 'svedit';
import type { AssetRefsRecord } from '#lib/server/backend.js';
import { ASSET_ID_REGEX } from './config.js';
import { ASSET_GRACE_PERIOD_DAYS } from './server_config.js';

/** The assets a document and its translations, given as their JSON values, refer to. */
export function asset_refs_of(
	document: Document,
	translations: { value: string }[]
): AssetRefsRecord {
	const payloads = [
		document,
		...translations.flatMap((row) => [...translation_payloads(JSON.parse(row.value))])
	];
	return { document_id: document.document_id, asset_ids: [...collect_asset_ids(payloads)] };
}

/** Every asset any document refers to, from the references kept per document. */
export async function referenced_asset_ids(): Promise<Set<string>> {
	return new Set((await backend.list_asset_refs()).flatMap((record) => record.asset_ids));
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
