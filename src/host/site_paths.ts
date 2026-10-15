/**
 * How the host maps URLs to sites: the first path segment is the site's name,
 * so /alice/about is the page /about of the site alice. Discovery documents
 * for a site's OAuth server live at the host root with the site's path
 * inserted, as RFC 8414 and RFC 9728 require. Pure functions, so the
 * universal reroute hook can use them in the browser too.
 */

/** Top-level paths Editable and the host serve themselves; a site cannot take their name. */
const reserved_names = new Set([
	'api',
	'assets',
	'design-system',
	'mcp',
	'new',
	'oauth',
	'robots.txt',
	'sitemap.xml',
	'host',
	'_app',
	'.well-known',
	'favicon.ico'
]);

export function is_site_name(name: string) {
	return /^[a-z][a-z0-9-]{2,29}$/.test(name) && !reserved_names.has(name);
}

/** The site a pathname belongs to and the path Editable routes for it, or null at the host root. */
export function split_site_path(pathname: string): { site: string; pathname: string } | null {
	const discovery =
		/^\/\.well-known\/(oauth-authorization-server|oauth-protected-resource)\/([^/]+)(\/.*)?$/.exec(
			pathname
		);
	if (discovery)
		return { site: discovery[2], pathname: `/.well-known/${discovery[1]}${discovery[3] ?? ''}` };
	const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
	if (!match || !is_site_name(match[1])) return null;
	return { site: match[1], pathname: match[2] || '/' };
}
