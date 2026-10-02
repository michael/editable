/**
 * Collect persisted media references from documents or translation payloads.
 * Dependency-free so both the app and standalone backup scripts use the same rule.
 * @param {Iterable<{ nodes?: Record<string, { type?: unknown, src?: unknown }> }>} payloads
 * @returns {Set<string>}
 */
export function collect_asset_ids(payloads) {
	const assets = new Set();
	for (const payload of payloads) {
		for (const node of Object.values(payload.nodes ?? {})) {
			if (
				(node.type === 'image' || node.type === 'video') &&
				typeof node.src === 'string' &&
				node.src &&
				!node.src.startsWith('blob:')
			)
				assets.add(node.src);
		}
	}
	return assets;
}

/** Yield property payloads from a sparse document/language translation map.
 * @template T
 * @param {Record<string, Record<string, T>>} map
 */
export function* translation_payloads(map) {
	if (!map || typeof map !== 'object' || Array.isArray(map))
		throw new Error('Invalid translation map');
	for (const properties of Object.values(map)) {
		if (!properties || typeof properties !== 'object' || Array.isArray(properties))
			throw new Error('Invalid translation properties');
		yield* Object.values(properties);
	}
}
