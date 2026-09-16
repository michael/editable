import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';

// In no-backend (VERCEL=1) mode there is no database, no login and no writing,
// so neither secret is needed. A validator only receives its own value, but this
// file is evaluated when the server starts and can read the environment directly.
const has_backend = () => !globalThis.process?.env?.VERCEL;

// Variables are validated twice: once while the app is built, and again when it
// starts. Deploys build without secrets — the Dockerfile runs `pnpm build` long
// before the server's .env exists — so required variables are only enforced at
// startup, never during the build.
function required_with_backend(hint: string) {
	return {
		'~standard': {
			version: 1 as const,
			vendor: 'editable',
			types: undefined as unknown as { input: string | undefined; output: string },
			validate: (value: unknown) => {
				if (!building && has_backend() && !value) {
					return { issues: [{ message: `Value is missing. ${hint}` }] };
				}

				return { value: (value ?? '') as string };
			}
		}
	};
}

// Variables that may legitimately be absent need a validator saying so,
// otherwise SvelteKit treats them as required non-empty strings.
function optional<T>(parse: (value: string | undefined) => T) {
	return {
		'~standard': {
			version: 1 as const,
			vendor: 'editable',
			// Type-only carrier that SvelteKit reads to infer the exported type.
			// Standard Schema never touches it at runtime.
			types: undefined as unknown as { input: string | undefined; output: T },
			validate: (value: unknown) => ({ value: parse(value as string | undefined) })
		}
	};
}

const where =
	'Set it in .env locally, via `fly secrets set` on Fly, or in the server .env on a VPS.';

export const variables = defineEnvVars({
	ADMIN_PASSWORD: {
		description:
			'Password for the admin login. Required whenever the backend is enabled — the app refuses to start without it. Unused in VERCEL=1 mode.',
		schema: required_with_backend(where)
	},
	ORIGIN: {
		description:
			'Public origin of the deployment, e.g. https://my-site.example.com. Used for canonical and social metadata. Required whenever the backend is enabled.',
		schema: required_with_backend(where)
	},
	VERCEL: {
		description:
			'Set by Vercel. Its absence is what puts the app in backend mode, so it must stay optional.',
		schema: optional((value) => value)
	},
	NODE_ENV: {
		description: 'Used to decide whether session cookies are marked secure.',
		schema: optional((value) => value)
	},
	DEMO_MODE: {
		public: true,
		static: true,
		description:
			'Set to true or 1 at build time to show the Edit button to unauthenticated visitors.',
		schema: optional((value) => value === 'true' || value === '1')
	}
});
