import { language_href, parse_languages, select_language } from '#app/languages.js';
import { LANGUAGES, VERCEL } from '$app/env/private';
import { default_site_document } from '#app/default_site.js';
import type { PageServerLoad } from './$types';

// The Vercel static build renders the default site once. Node deployments stay
// dynamic so database-backed home pages can update without a rebuild.
export const prerender = !!VERCEL;

// Deliberately no `await parent()` here: depending on layout data would rerun
// this load whenever unrelated layout data changes. Saves explicitly refresh
// all page data. has_backend and is_admin reach the page via the layout merge.
export const load: PageServerLoad = async ({ url }) => {
	if (VERCEL) {
		return {
			document: default_site_document,
			slug: null
		};
	}

	const { get_home_document, get_translated_document } = await import('#app/api.remote.js');
	const result = await get_home_document();
	const languages = parse_languages(LANGUAGES);
	if (!languages.length) return result;
	const language = select_language(languages, url.searchParams.get('lang'));
	return {
		...result,
		canonical_path: language_href('/', language, languages[0]),
		...(await get_translated_document({ document_id: result.document.document_id, language }))
	};
};
