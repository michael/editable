import { site, request_language } from '#app/server_site.js';
import { LICENSE_KEY, VERCEL } from '$app/env/private';
import { get_shared_site_documents, get_site_metadata } from '#app/page_loaders.js';
import { page_shell } from '#app/page_shell.js';
import type { LayoutServerLoad } from './$types';

// Static hosts resolve directory indexes reliably, while Node deployments keep
// the existing no-trailing-slash URLs for database-backed routes.
export const trailingSlash = VERCEL ? 'always' : 'never';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const language = request_language(url);

	const [shared_documents, site_metadata] = await Promise.all([
		get_shared_site_documents(language),
		get_site_metadata()
	]);

	return {
		languages: site.languages,
		language,
		has_backend: !VERCEL,
		user: locals.user,
		is_editor: locals.is_editor,
		// Commercial websites need a license; editors are reminded while no key is set.
		license_hint: locals.is_editor && !LICENSE_KEY,
		origin: site.origin,
		site_base: site.base,
		favicon: site_metadata.favicon,
		// The site's banner, nav, and footer, for pages whose body is a route's own (see PageShell).
		page_shell: page_shell(shared_documents)
	};
};
