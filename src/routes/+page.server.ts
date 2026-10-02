import { VERCEL } from '$app/env/private';
export { load_home as load } from '#app/page_loaders.js';

export const prerender = !!VERCEL;
