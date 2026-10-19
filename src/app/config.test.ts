import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import slugify from 'slugify';
import { expect, it } from 'vitest';
import { RESERVED_ROUTE_SLUGS } from './config.js';

/** Whether a folder serves anything: a +page or +server file in it or below. */
const serves = (dir: string): boolean =>
	readdirSync(dir, { withFileTypes: true }).some((entry) =>
		entry.isDirectory() ? serves(join(dir, entry.name)) : /^\+(page|server)\./.test(entry.name)
	);

/**
 * The route folders whose names a page's slug could match, looking inside
 * route groups such as (app). Params like [page_id], .well-known, and
 * sitemap.xml are no slug, so they never need reserving; nor do folders that
 * serve nothing, such as one holding helpers.
 */
function route_slugs(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && serves(join(dir, entry.name)))
		.flatMap((entry) =>
			entry.name.startsWith('(')
				? route_slugs(join(dir, entry.name))
				: slugify(entry.name, { lower: true, strict: true, trim: true }) === entry.name
					? [entry.name]
					: []
		);
}

it('reserves exactly the routes whose URL a page could otherwise take', () => {
	expect(
		[...RESERVED_ROUTE_SLUGS].sort(),
		'RESERVED_ROUTE_SLUGS in src/app/config.ts lists every route folder a page slug could match'
	).toEqual(route_slugs(fileURLToPath(new URL('../routes', import.meta.url))).sort());
});
