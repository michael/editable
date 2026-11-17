import { defineEnvVars } from '@sveltejs/kit/env';
import { building } from '$app/env';

// Variables are validated twice: once while the app is built, and again when it
// starts. Deploys build without secrets — the Dockerfile runs `pnpm build` long
// before the server's .env exists — so required variables are only enforced at
// startup, never during the build.
function required(hint: string) {
	return {
		'~standard': {
			version: 1 as const,
			vendor: 'editable',
			types: undefined as unknown as { input: string | undefined; output: string },
			validate: (value: unknown) => {
				if (!building && !value) {
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
	LANGUAGES: {
		description:
			"The site's language (de), or for experimental translations comma-separated language tags, original first (en,de).",
		schema: required(
			'Set the site\'s language, such as LANGUAGES="en", or several for translations, original first: in .env locally, under [env] in fly.toml on Fly, or in the server .env on a VPS.'
		)
	},
	ADMIN_PASSWORD: {
		description: 'Password for the admin login. The app refuses to start without it.',
		schema: required(where)
	},
	ORIGIN: {
		description:
			'Public origin of the deployment, e.g. https://my-site.example.com. Used for canonical and social metadata.',
		schema: required(where)
	},
	NODE_ENV: {
		description: 'Used to decide whether session cookies are marked secure.',
		schema: optional((value) => value)
	},
	LICENSE_KEY: {
		description:
			'License key for a commercial website, from editable.website. Without one, editors see a hint about licensing in edit mode.',
		schema: optional((value) => value)
	},
	DEMO_MODE: {
		public: true,
		description: 'Set to true or 1 to show the Edit button to unauthenticated visitors.',
		schema: optional((value) => value === 'true' || value === '1')
	}
});
