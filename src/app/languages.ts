/** Experimental language configuration. */
export function parse_languages(value: string | undefined): string[] {
	if (!value?.trim()) return [];
	const languages = [
		...new Set(
			value.split(',').map((tag) => {
				const trimmed = tag.trim();
				if (!trimmed)
					throw new Error(
						'LANGUAGES must contain comma-separated language tags, e.g. en,de.'
					);
				return Intl.getCanonicalLocales(trimmed)[0];
			})
		)
	];
	return languages.length > 1 ? languages : [];
}

export function select_language(languages: string[], requested: string | null | undefined) {
	return languages.includes(requested ?? '') ? requested! : (languages[0] ?? '');
}

export function language_href(href: string, language: string, main_language: string) {
	const url = new URL(href, 'http://editable.local');
	if (language && language !== main_language) url.searchParams.set('lang', language);
	else url.searchParams.delete('lang');
	return `${url.pathname}${url.search}${url.hash}`;
}
