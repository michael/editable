import { query } from '$app/server';
import * as v from 'valibot';
import { is_site_name } from './site_names.js';
import { site_exists } from './sites.js';

/** Whether a site with this name exists, so the form can offer to log in instead of creating it. */
export const site_taken = query(v.string(), (name) => is_site_name(name) && site_exists(name));
