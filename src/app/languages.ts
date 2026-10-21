/** The tags in LANGUAGES, canonical and without repeats. */
function language_tags(value: string | undefined): string[] {
	if (!value?.trim()) return [];
	return [
		...new Set(
			value.split(',').map((tag) => {
				const trimmed = tag.trim();
				if (!trimmed)
					throw new Error('LANGUAGES must contain comma-separated language tags, e.g. en,de.');
				return Intl.getCanonicalLocales(trimmed)[0];
			})
		)
	];
}

/** Experimental language configuration: translations need two languages or more. */
export function parse_languages(value: string | undefined): string[] {
	const languages = language_tags(value);
	return languages.length > 1 ? languages : [];
}

/** The language a site is written in: the first in LANGUAGES, which every site with a backend sets. */
export function main_language(value: string | undefined): string {
	const [language] = language_tags(value);
	if (!language)
		throw new Error(
			"LANGUAGES must name the site's language, such as en, or several, original first."
		);
	return language;
}

export function select_language(languages: string[], requested: string | null | undefined) {
	return languages.includes(requested ?? '') ? requested! : (languages[0] ?? '');
}

/** Secondary languages own their root URL instead of a page slug. */
export function is_reserved_language_slug(slug: string, languages: string[]) {
	return languages.slice(1).includes(slug);
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
	return `${url.pathname}${url.search}${url.hash}`;
}
