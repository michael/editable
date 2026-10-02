import prettier from 'eslint-config-prettier';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import globals from 'globals';
import { loadConfig } from '@sveltejs/load-config';

const svelte_config = (await loadConfig('./', { traverse: false }))?.config;

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

/** @type {import('eslint').Linter.Config[]} */
export default [
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.js', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: typescriptParser, svelteConfig: svelte_config }
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			'svelte/no-navigation-without-resolve': 'off',
			// The base rule reports parameters in type annotations; use the
			// TypeScript-aware variant.
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	// TypeScript configuration for regular .ts modules (.svelte.ts files are
	// handled by the svelte plugin configs above so runes stay defined)
	{
		files: ['**/*.ts'],
		ignores: ['**/*.d.ts', '**/*.svelte.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			// TypeScript itself checks undefined names and unused variables of
			// type-only constructs; use the TS-aware variants.
			'no-undef': 'off',
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
			]
		}
	},
	// TypeScript configuration for .d.ts files
	{
		files: ['**/*.d.ts'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				project: './tsconfig.json',
				ecmaVersion: 2022,
				sourceType: 'module'
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			// Enable TypeScript-specific rules for .d.ts files
			'no-undef': 'off',
			'@typescript-eslint/no-unused-vars': 'error',
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/prefer-namespace-keyword': 'error',
			'@typescript-eslint/triple-slash-reference': 'error',
			'@typescript-eslint/no-duplicate-enum-values': 'error',
			'@typescript-eslint/no-empty-object-type': 'error',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-misused-new': 'error',
			'@typescript-eslint/no-namespace': 'error',
			'@typescript-eslint/no-this-alias': 'error'
		}
	}
];
