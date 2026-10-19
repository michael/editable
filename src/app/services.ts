import type { Backend } from '#lib/server/backend.js';
import { migrate } from '#app/migrations.js';
import { create_backend } from '#app/create_backend.js';
import { site } from '#app/server_site.js';
import { WEBP_HEADER_BYTES, webp_dimensions } from '#lib/server/webp.js';

let default_backend: Promise<Backend> | undefined;

/** The deployment's own backend, from create_backend, migrated on first use. */
export function get_default_backend(): Promise<Backend> {
	default_backend ??= (async () => {
		const backend = create_backend();
		await migrate(backend);
		return backend;
	})();
	return default_backend;
}

/** The backend of the current request's site. */
export async function get_backend(): Promise<Backend> {
	return site.backend ?? get_default_backend();
}

/** The functions Editable's server code calls. */
type SiteBackend = Omit<
	Backend,
	'name' | 'storage' | 'applied_migrations' | 'run_migration' | 'close'
>;

/**
 * The current site's backend. Each call goes to the backend of the request it
 * runs in, so code imports it once and uses it inside functions.
 */
export const backend = new Proxy({} as SiteBackend, {
	get: (_, name: keyof SiteBackend | 'then') =>
		// Not a promise: awaiting the proxy would otherwise never settle.
		name === 'then'
			? undefined
			: async (...args: unknown[]) =>
					((await get_backend())[name] as (...args: unknown[]) => unknown)(...args)
});

/** Whether an asset original, or one of its variants, exists. */
export async function asset_exists(asset_id: string, variant?: string) {
	return (await backend.asset_size(asset_id, variant)) !== null;
}

/** The pixel dimensions of a WebP asset or variant, or null if it is missing or not WebP. */
export async function asset_webp_dimensions(asset_id: string, variant?: string) {
	const range = { start: 0, end: WEBP_HEADER_BYTES - 1 };
	const stream = await backend.read_asset(asset_id, { variant, range });
	return stream && webp_dimensions(new Uint8Array(await new Response(stream).arrayBuffer()));
}
