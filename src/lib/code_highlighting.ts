import type { LanguageFactory } from '@twinkleplop/core';

const language_loaders: Record<string, () => Promise<{ tokenize: LanguageFactory }>> = {
	bash: () => import('@twinkleplop/bash'),
	css: () => import('@twinkleplop/css'),
	diff: () => import('@twinkleplop/diff'),
	'diff-basic': () => import('@twinkleplop/diff-basic'),
	dotenv: () => import('@twinkleplop/dotenv'),
	go: () => import('@twinkleplop/go'),
	html: () => import('@twinkleplop/html'),
	http: () => import('@twinkleplop/http'),
	ini: () => import('@twinkleplop/ini'),
	javascript: () => import('@twinkleplop/javascript'),
	json: () => import('@twinkleplop/json'),
	jsonc: () => import('@twinkleplop/jsonc'),
	markdown: () => import('@twinkleplop/markdown'),
	python: () => import('@twinkleplop/python'),
	rust: () => import('@twinkleplop/rust'),
	shellsession: () => import('@twinkleplop/shellsession'),
	sql: () => import('@twinkleplop/sql'),
	svelte: () => import('@twinkleplop/svelte'),
	toml: () => import('@twinkleplop/toml'),
	tsx: () => import('@twinkleplop/tsx'),
	typescript: () => import('@twinkleplop/typescript'),
	yaml: () => import('@twinkleplop/yaml')
};

const tokenizers = new Map<string, ReturnType<LanguageFactory> | null>();
const pending_languages = new Map<string, Promise<void>>();

export function code_language_loaded(layout: string) {
	return tokenizers.has(layout) || !Object.hasOwn(language_loaders, layout);
}

export async function load_code_language(layout: string): Promise<void> {
	if (code_language_loaded(layout)) return;
	let pending = pending_languages.get(layout);
	if (!pending) {
		pending = language_loaders[layout]()
			.then(({ tokenize }) => {
				tokenizers.set(layout, tokenize());
			})
			.catch((error) => {
				// Keep content readable if a grammar chunk cannot be downloaded.
				console.warn(`Could not load code language ${layout}`, error);
				tokenizers.set(layout, null);
			})
			.finally(() => pending_languages.delete(layout));
		pending_languages.set(layout, pending);
	}
	await pending;
}

export function tokenize_code(content: string, layout: string) {
	return tokenizers.get(layout)?.(content) ?? null;
}

export async function highlight_code(content: string, layout: string) {
	await load_code_language(layout);
	const result = tokenize_code(content, layout);
	if (!result) return null;
	const { tokens, token_types } = result;
	const segments: { text: string; class_name: string }[] = [];
	let offset = 0;
	for (let index = 0; index < tokens.length; index += 3) {
		const start = tokens[index + 1];
		const end = tokens[index + 2];
		if (start > offset) segments.push({ text: content.slice(offset, start), class_name: '' });
		segments.push({
			text: content.slice(start, end),
			class_name: code_token_classes[code_token_color(token_types[tokens[index]])]
		});
		offset = end;
	}
	if (offset < content.length) segments.push({ text: content.slice(offset), class_name: '' });
	return segments;
}

export const code_token_classes: Record<string, string> = {
	foreground: 'text-(--code-foreground)',
	comment: 'text-(--code-comment)',
	deleted: 'text-(--code-deleted)',
	inserted: 'text-(--code-inserted)',
	escape: 'text-(--code-escape)',
	keyword: 'text-(--code-keyword)',
	string: 'text-(--code-string)',
	number: 'text-(--code-number)',
	constant: 'text-(--code-constant)',
	function: 'text-(--code-function)',
	property: 'text-(--code-property)',
	type: 'text-(--code-type)',
	attribute: 'text-(--code-attribute)',
	punctuation: 'text-(--code-punctuation)'
};

export function code_token_color(type: string): string {
	if (/comment/.test(type)) return 'comment';
	if (/deleted|removed/.test(type)) return 'deleted';
	if (/inserted|added/.test(type)) return 'inserted';
	if (/escape/.test(type)) return 'escape';
	if (/keyword|storage|preproc/.test(type)) return 'keyword';
	if (/regex/.test(type)) return 'number';
	if (/string|template|char|code/.test(type)) return 'string';
	if (/number|boolean|changed/.test(type)) return 'number';
	if (/constant/.test(type)) return 'constant';
	if (/function|method/.test(type)) return 'function';
	if (/property|parameter|heading/.test(type)) return 'property';
	if (/type|class|enum|operator|url/.test(type)) return 'type';
	if (/tag|attribute|label/.test(type)) return 'attribute';
	if (/link/.test(type)) return 'function';
	if (/punctuation/.test(type)) return 'punctuation';
	return 'foreground';
}
