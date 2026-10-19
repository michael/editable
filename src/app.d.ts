// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// SvelteKit's App types rely on declaration merging, so this must stay
		// an interface.
		// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
		interface Locals {
			/** Whoever is signed in, or null; signed-in users may edit the site. */
			user: import('#app/server_auth.js').User | null;
			/** Whether the signed-in user may edit the site. */
			is_editor: boolean;
			/** Set by a host serving several sites; otherwise the deployment's own site is used. */
			site?: import('#app/server_site.js').Site;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
