import { AsyncLocalStorage } from 'node:async_hooks';
import { collection_names, type Backend, type Collection } from '../backend.js';

/**
 * Make a backend over a single connection safe for concurrent requests:
 * record operations and transactions run one at a time, in order, and a
 * transaction's own operations run inside it: those through its tx, and
 * those through the backend made from the work the transaction runs. Asset
 * files are not queued, so a long upload never holds up a page load.
 */
export function one_at_a_time(
	backend: Omit<Backend, 'transaction'>,
	hooks: { begin(): void; commit(): void; rollback(): void }
): Backend {
	let tail: Promise<unknown> = Promise.resolve();
	function queued<T>(work: () => Promise<T>): Promise<T> {
		const result = tail.then(work);
		tail = result.catch(() => {});
		return result;
	}
	// The open transaction the current async work belongs to, if any.
	const scope = new AsyncLocalStorage<{ tx: Backend; open: boolean }>();
	const current = () => {
		const state = scope.getStore();
		return state?.open ? state.tx : null;
	};
	const outside = <T>(work: () => Promise<T>) => (current() ? work() : queued(work));

	/** The record operations, each run through run. */
	function records(run: <T>(work: () => Promise<T>) => Promise<T>) {
		const wrapped = Object.fromEntries(
			collection_names.map((name) => {
				const collection = backend[name] as Collection<unknown>;
				const wrapper: Collection<unknown> = {
					get: (key) => run(() => collection.get(key)),
					all: () => run(() => collection.all()),
					put: (record) => run(() => collection.put(record)),
					delete: (key) => run(() => collection.delete(key))
				};
				return [name, wrapper];
			})
		) as Pick<Backend, (typeof collection_names)[number]>;
		return {
			...wrapped,
			delete_expired: (now: number) => run(() => backend.delete_expired(now)),
			applied_migrations: () => run(() => backend.applied_migrations()),
			record_migration: (id: string) => run(() => backend.record_migration(id))
		};
	}

	return {
		...backend,
		...records(outside),
		transaction: (fn) => {
			const open_tx = current();
			if (open_tx) return fn(open_tx);
			return queued(async () => {
				const state = { tx: undefined as unknown as Backend, open: true };
				const inside = <T>(work: () => Promise<T>) =>
					state.open ? work() : Promise.reject(new Error('The transaction has already ended.'));
				const tx: Backend = { ...backend, ...records(inside), transaction: (inner) => inner(tx) };
				state.tx = tx;
				hooks.begin();
				try {
					const result = await scope.run(state, () => fn(tx));
					hooks.commit();
					return result;
				} catch (error) {
					hooks.rollback();
					throw error;
				} finally {
					state.open = false;
				}
			});
		},
		close: () => queued(() => backend.close())
	};
}
