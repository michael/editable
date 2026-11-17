/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter: adapter(),
			// OAuth clients post token requests as forms without an Origin header,
			// which SvelteKit's origin check would reject. The admin cookie is
			// SameSite=Lax, so cross-site form posts cannot carry it anyway.
			csrf: { trustedOrigins: ['*'] },
			experimental: {
				remoteFunctions: true
			},
			// alias: {
			// 	svedit: '../svedit/src/lib/index.ts'
			// },
			compilerOptions: {
				experimental: {
					async: true
				}
			}
		})
	],
	optimizeDeps: {
		exclude: ['@jsquash/webp']
	},
	worker: {
		format: 'es'
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
