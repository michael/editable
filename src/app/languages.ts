/** Experimental language configuration. */
export function parse_languages(value: string | undefined): string[] {
	if (!value?.trim()) return [];
	const languages = [
		...new Set(
			value.split(',').map((tag) => {
				const trimmed = tag.trim();
				if (!trimmed)
					throw new Error('LANGUAGES must contain comma-separated language tags, e.g. en,de.');
				return Intl.getCanonicalLocales(trimmed)[0];
			})
		)
	];
	return languages.length > 1 ? languages : [];
}

export function select_language(languages: string[], requested: string | null | undefined) {
	return languages.includes(requested ?? '') ? requested! : (languages[0] ?? '');
}

/** Resolve only configured secondary-language prefixes. */
export function language_path(pathname: string, languages: string[]) {
	const prefix = pathname.split('/')[1];
	const translated = languages.slice(1).includes(prefix);
	return {
		language: translated ? prefix : (languages[0] ?? ''),
		pathname: translated ? pathname.slice(prefix.length + 1) || '/' : pathname
	};
}

export function language_href(href: string, language: string, languages: string[]) {
	const url = new URL(href, 'http://editable.local');
	const { pathname } = language_path(url.pathname, languages);
	url.pathname =
		language && language !== languages[0]
			? `/${language}${pathname === '/' ? '' : pathname}`
			: pathname;
	if (url.searchParams.has('lang')) url.searchParams.delete('lang');
	return `${url.pathname}${url.search}${url.hash}`;
}
