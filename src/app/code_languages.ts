// Languages a code block can highlight, keyed by the id its `language` property stores.
export const code_languages = {
	plain: 'Plain text',
	bash: 'Bash',
	css: 'CSS',
	diff: 'Diff',
	'diff-basic': 'Diff (basic)',
	dotenv: 'Dotenv',
	go: 'Go',
	html: 'HTML',
	http: 'HTTP',
	ini: 'INI',
	javascript: 'JavaScript',
	json: 'JSON',
	jsonc: 'JSON with comments',
	markdown: 'Markdown',
	python: 'Python',
	rust: 'Rust',
	shellsession: 'Shell session',
	sql: 'SQL',
	svelte: 'Svelte',
	toml: 'TOML',
	tsx: 'TSX / JSX',
	typescript: 'TypeScript',
	yaml: 'YAML'
};

export const code_language_ids = Object.keys(code_languages);

const language_aliases: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	jsx: 'tsx',
	sh: 'bash',
	shell: 'bash',
	console: 'shellsession',
	py: 'python',
	rs: 'rust',
	yml: 'yaml',
	env: 'dotenv',
	md: 'markdown',
	htm: 'html'
};

export function normalize_code_language(language?: string | null): string {
	const name = language?.trim().toLowerCase() ?? '';
	const id = language_aliases[name] ?? name;
	return Object.hasOwn(code_languages, id) ? id : 'plain';
}
