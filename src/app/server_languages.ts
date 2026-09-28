import { LANGUAGES, VERCEL } from '$app/env/private';
import { parse_languages, select_language } from './languages.js';

// No database dependencies: safe to import from static/no-backend routes.
export const languages = VERCEL ? [] : parse_languages(LANGUAGES);

export function request_language(url: URL) {
	return languages.length ? select_language(languages, url.searchParams.get('lang')) : '';
}
