import type { LanguageFactory } from '@twinkleplop/core';
import { tokenize as tokenize_bash } from '@twinkleplop/bash';
import { tokenize as tokenize_css } from '@twinkleplop/css';
import { tokenize as tokenize_diff } from '@twinkleplop/diff';
import { tokenize as tokenize_diff_basic } from '@twinkleplop/diff-basic';
import { tokenize as tokenize_dotenv } from '@twinkleplop/dotenv';
import { tokenize as tokenize_go } from '@twinkleplop/go';
import { tokenize as tokenize_html } from '@twinkleplop/html';
import { tokenize as tokenize_http } from '@twinkleplop/http';
import { tokenize as tokenize_ini } from '@twinkleplop/ini';
import { tokenize as tokenize_javascript } from '@twinkleplop/javascript';
import { tokenize as tokenize_json } from '@twinkleplop/json';
import { tokenize as tokenize_jsonc } from '@twinkleplop/jsonc';
import { tokenize as tokenize_markdown } from '@twinkleplop/markdown';
import { tokenize as tokenize_python } from '@twinkleplop/python';
import { tokenize as tokenize_rust } from '@twinkleplop/rust';
import { tokenize as tokenize_shellsession } from '@twinkleplop/shellsession';
import { tokenize as tokenize_sql } from '@twinkleplop/sql';
import { tokenize as tokenize_svelte } from '@twinkleplop/svelte';
import { tokenize as tokenize_toml } from '@twinkleplop/toml';
import { tokenize as tokenize_tsx } from '@twinkleplop/tsx';
import { tokenize as tokenize_typescript } from '@twinkleplop/typescript';
import { tokenize as tokenize_yaml } from '@twinkleplop/yaml';

const language_factories: Record<string, LanguageFactory> = {
	bash: tokenize_bash,
	css: tokenize_css,
	diff: tokenize_diff,
	'diff-basic': tokenize_diff_basic,
	dotenv: tokenize_dotenv,
	go: tokenize_go,
	html: tokenize_html,
	http: tokenize_http,
	ini: tokenize_ini,
	javascript: tokenize_javascript,
	json: tokenize_json,
	jsonc: tokenize_jsonc,
	markdown: tokenize_markdown,
	python: tokenize_python,
	rust: tokenize_rust,
	shellsession: tokenize_shellsession,
	sql: tokenize_sql,
	svelte: tokenize_svelte,
	toml: tokenize_toml,
	tsx: tokenize_tsx,
	typescript: tokenize_typescript,
	yaml: tokenize_yaml
};

const tokenizers = new Map<string, ReturnType<LanguageFactory>>();

export function highlight_code(content: string, layout: string) {
	if (!Object.hasOwn(language_factories, layout)) return null;
	const factory = language_factories[layout];
	if (!factory) return null;
	let tokenize = tokenizers.get(layout);
	if (!tokenize) {
		tokenize = factory();
		tokenizers.set(layout, tokenize);
	}
	const { tokens, token_types } = tokenize(content);
	const segments: { text: string; class_name: string }[] = [];
	let offset = 0;
	for (let index = 0; index < tokens.length; index += 3) {
		const start = tokens[index + 1];
		const end = tokens[index + 2];
		if (start > offset) segments.push({ text: content.slice(offset, start), class_name: '' });
		segments.push({
			text: content.slice(start, end),
			class_name: token_class(token_types[tokens[index]])
		});
		offset = end;
	}
	if (offset < content.length) segments.push({ text: content.slice(offset), class_name: '' });
	return segments;
}

function token_class(type: string): string {
	if (/comment/.test(type)) return 'text-(--code-comment)';
	if (/deleted|removed/.test(type)) return 'text-(--code-deleted)';
	if (/inserted|added/.test(type)) return 'text-(--code-inserted)';
	if (/escape/.test(type)) return 'text-(--code-escape)';
	if (/keyword|storage|preproc/.test(type)) return 'text-(--code-keyword)';
	if (/regex/.test(type)) return 'text-(--code-number)';
	if (/string|template|char|code/.test(type)) return 'text-(--code-string)';
	if (/number|boolean|changed/.test(type)) return 'text-(--code-number)';
	if (/constant/.test(type)) return 'text-(--code-constant)';
	if (/function|method/.test(type)) return 'text-(--code-function)';
	if (/property|parameter|heading/.test(type)) return 'text-(--code-property)';
	if (/type|class|enum|operator|url/.test(type)) return 'text-(--code-type)';
	if (/tag|attribute|label/.test(type)) return 'text-(--code-attribute)';
	if (/link/.test(type)) return 'text-(--code-function)';
	if (/punctuation/.test(type)) return 'text-(--code-punctuation)';
	return 'text-(--code-foreground)';
}
