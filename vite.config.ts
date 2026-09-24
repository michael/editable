/// <reference types="vitest/config" />
import adapter_node from '@sveltejs/adapter-node';
import adapter_static from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const adapter = process.env.VERCEL ? adapter_static({ strict: false }) : adapter_node();
const prerender = process.env.VERCEL ? { crawl: false } : undefined;

export default defineConfig(({ mode }) => {
	// A shell's ordinary LANG locale must not shadow the application's opt-in .env setting.
	if (!process.env.LANG?.includes(',')) {
		let configured_language: string | undefined;
		for (const file of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
			if (!existsSync(file)) continue;
			const value = parseEnv(readFileSync(file, 'utf8')).LANG;
			if (value !== undefined) configured_language = value;
		}
		if (configured_language !== undefined) process.env.LANG = configured_language;
	}
	return {
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
	};
});
