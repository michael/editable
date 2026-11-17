import {
	default_banner_document,
	default_footer_document,
	default_nav_document,
	default_site_document
} from '#app/default_site.js';
import { site, request_language } from '#app/server_site.js';
import { language_href } from '#app/languages.js';
import { resolve_href, resolve_hrefs } from '#app/document_links.js';
import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { VERCEL } from '$app/env/private';
import { get_markdown_page } from '#app/markdown/registry.js';
import { convert_markdown } from '#app/markdown/convert.js';
import { compose_markdown_document } from '#app/markdown/compose.js';
import { extract_site_metadata } from '#app/page_metadata.js';
import type { Document } from 'svedit';

export const load_page = async ({
	params,
	url
}: {
	params: { page_id?: string; language?: string };
	url: URL;
}) => {
	const { languages } = site;
	if (params.language && !languages.slice(1).includes(params.language))
		error(404, 'Page not found');
	if (!params.language && languages.slice(1).includes(params.page_id ?? ''))
		return load_home({ url });
	const language = request_language(url);
	// Configured markdown pages win over database slugs.
	const markdown_page = get_markdown_page(`/${params.page_id}`);

	if (markdown_page) {
		let document: Document;
		try {
			const shared_documents = await get_shared_site_documents(language);
			const page_doc = convert_markdown(markdown_page.markdown, markdown_page);
			document = compose_markdown_document(page_doc, shared_documents);
			document = resolve_hrefs(document, site, language);
		} catch (err) {
			// Log the detailed error (with filesystem paths) server-side only.
			console.error(`Failed to render markdown page ${markdown_page.pathname}:`, err);
			error(500, dev && err instanceof Error ? err.message : 'Failed to render page');
		}

		return {
			document,
			slug: params.page_id,
			canonical_path: `/${params.page_id}`,
			can_edit: false,
			content_source: 'markdown'
		};
	}

	try {
		const { get_document } = await import('#app/api.remote.js');
		const page = await get_document({ slug: params.page_id ?? '', language });

		if (page.redirect_to_slug) {
			redirect(301, resolve_href(`/${page.redirect_to_slug}${url.search}`, site, language));
		}

		return {
			...page,
			canonical_path: languages.length ? language_href(`/${page.slug}`, language, languages) : null,
			can_edit: true
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		error(404, 'Page not found');
	}
};

/**
 * The site's banner, nav, and footer documents in the given language: the
 * backend's documents when there is one, the default site documents on static builds.
 */
export async function get_shared_site_documents(language: string) {
	if (VERCEL) {
		return {
			banner_document: default_banner_document,
			nav_document: default_nav_document,
			footer_document: default_footer_document
		};
	}
	const { get_shared_documents } = await import('#app/server_documents.js');
	const shared = await get_shared_documents();
	if (!language) return shared;
	const { translate_shared_document } = await import('#app/server_translations.js');
	const [banner_document, nav_document, footer_document] = await Promise.all(
		[shared.banner_document, shared.nav_document, shared.footer_document].map((document) =>
			translate_shared_document(document, language)
		)
	);
	return { banner_document, nav_document, footer_document };
}

/** The site's metadata, such as its favicon, from the home page or, on static builds, the default site. */
export async function get_site_metadata() {
	if (VERCEL) return extract_site_metadata(default_site_document);
	const { get_doc_from_db, get_home_page_id_from_db } = await import('#app/server_documents.js');
	const home_page_id = await get_home_page_id_from_db();
	return home_page_id
		? extract_site_metadata(await get_doc_from_db(home_page_id))
		: { favicon: null };
}

export const load_home = async ({ url }: { url: URL }) => {
	if (VERCEL) {
		return {
			document: default_site_document,
			slug: null
		};
	}

	const { get_document } = await import('#app/api.remote.js');
	const { languages } = site;
	const language = request_language(url);
	return {
		...(await get_document({ slug: '/', language })),
		canonical_path: languages.length ? language_href('/', language, languages) : null
	};
};
