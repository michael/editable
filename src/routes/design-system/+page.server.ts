import { VERCEL } from '$app/env/private';

export const prerender = !!VERCEL;
