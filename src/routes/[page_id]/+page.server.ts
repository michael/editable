import { VERCEL } from '$app/env/private';
import { get_markdown_page_pathnames } from '#app/markdown/registry.js';
export { load_page as load } from '#app/page_loaders.js';

export const prerender = !!VERCEL;
export function entries() {
	return VERCEL
		? get_markdown_page_pathnames().map((pathname) => ({ page_id: pathname.slice(1) }))
		: [];
}
