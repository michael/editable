import { AsyncLocalStorage } from 'node:async_hooks';
import { collection_names, type Backend, type Collection } from '#lib/server/backend.js';
import { migrate } from '#app/migrations.js';
import { create_backend } from '#app/server_backend.js';
import { site } from '#app/server_site.js';
import { WEBP_HEADER_BYTES, webp_dimensions } from '#lib/server/webp.js';

let default_backend: Promise<Backend> | undefined;

/** The deployment's own backend, from create_backend, migrated on first use. */
export function get_default_backend(): Promise<Backend> {
	default_backend ??= (async () => {
		const backend = create_backend();
		await migrate(backend);
		return backend;
	})().catch((error) => {
		default_backend = undefined;
		throw error;
	});
	return default_backend;
}

// The transaction the current async work runs in, if any.
const transaction_scope = new AsyncLocalStorage<Backend>();

/** The backend of the current request's site, or of the transaction it runs in. */
export async function get_backend(): Promise<Backend> {
	return transaction_scope.getStore() ?? site.backend ?? get_default_backend();
}

/** What Editable's server code reads and writes through. */
export type SiteBackend = Omit<
	Backend,
	'name' | 'storage' | 'applied_migrations' | 'record_migration' | 'close'
>;

const forward =
	<K extends keyof SiteBackend>(name: K) =>
	async (...args: unknown[]) =>
		((await get_backend())[name] as (...args: unknown[]) => unknown)(...args);

/**
 * The current site's backend. Each call goes to the backend of the request it
 * runs in, so code imports it once and uses it inside functions. Inside
 * backend.transaction, it is the transaction.
 */
export const backend: SiteBackend = {
	...(Object.fromEntries(
		collection_names.map((name) => {
			const collection = async () => (await get_backend())[name] as Collection<unknown>;
			const forwarded: Collection<unknown> = {
				get: async (key) => (await collection()).get(key),
				all: async () => (await collection()).all(),
				put: async (record) => (await collection()).put(record),
				delete: async (key) => (await collection()).delete(key)
			};
			return [name, forwarded];
		})
	) as Pick<SiteBackend, (typeof collection_names)[number]>),
	transaction: async (fn) =>
		(await get_backend()).transaction((tx) => transaction_scope.run(tx, () => fn(tx))),
	write_asset: forward('write_asset') as SiteBackend['write_asset'],
	read_asset: forward('read_asset') as SiteBackend['read_asset'],
	asset_size: forward('asset_size') as SiteBackend['asset_size'],
	delete_asset: forward('delete_asset') as SiteBackend['delete_asset'],
	touch_asset: forward('touch_asset') as SiteBackend['touch_asset'],
	list_assets: forward('list_assets') as SiteBackend['list_assets'],
	delete_expired: forward('delete_expired') as SiteBackend['delete_expired']
};

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
