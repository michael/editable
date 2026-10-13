import type { Reroute } from '@sveltejs/kit/hooks';
import { split_site_path } from './host/site_paths.js';

// The host root is the registration page; every other first path segment names a site.
export const reroute: Reroute = ({ url }) => {
	if (url.pathname === '/') return '/host';
	return split_site_path(url.pathname)?.pathname;
};
