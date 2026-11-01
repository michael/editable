import { site, request_language } from '#app/server_site.js';
import { VERCEL } from '$app/env/private';
import { default_site_document } from '#app/default_site.js';
import { get_shared_site_documents } from '#app/page_loaders.js';
import { extract_site_metadata } from '#app/page_metadata.js';
import { page_shell } from '#app/page_shell.js';
import type { Document } from 'svedit';
import type { LayoutServerLoad } from './$types';

// Static hosts resolve directory indexes reliably, while Node deployments keep
// the existing no-trailing-slash URLs for database-backed routes.
export const trailingSlash = VERCEL ? 'always' : 'never';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const has_backend = !VERCEL;
	const language = request_language(url);

	let site_metadata;
	let shell: Document;
	if (has_backend) {
		const { get_site_metadata } = await import('#app/api.remote.js');
		const [shared_documents, next_site_metadata] = await Promise.all([
			get_shared_site_documents(language),
			get_site_metadata()
		]);
		shell = page_shell(shared_documents);
		site_metadata = next_site_metadata;
	} else {
		site_metadata = extract_site_metadata(default_site_document);
		shell = page_shell(await get_shared_site_documents(language));
	}

	return {
		languages: site.languages,
		language,
		has_backend,
		user: locals.user,
		is_editor: locals.is_editor,
		origin: site.origin,
		site_base: site.base,
		favicon: site_metadata.favicon,
		// The site's banner, nav, and footer, for pages whose body is a route's own (see PageShell).
		page_shell: shell
	};
};
