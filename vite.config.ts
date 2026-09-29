/// <reference types="vitest/config" />
import adapter_node from '@sveltejs/adapter-node';
import adapter_static from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const adapter = process.env.VERCEL ? adapter_static({ strict: false }) : adapter_node();
const prerender = process.env.VERCEL ? { crawl: false } : undefined;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			adapter,
			prerender,
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
