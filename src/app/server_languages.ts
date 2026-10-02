import { LANGUAGES, VERCEL } from '$app/env/private';
import { parse_languages, language_path } from './languages.js';

// No database dependencies: safe to import from static/no-backend routes.
export const languages = VERCEL ? [] : parse_languages(LANGUAGES);

export function request_language(url: URL) {
	if (!languages.length) return '';
	return language_path(url.pathname, languages).language;
}
