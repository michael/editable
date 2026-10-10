/** Top-level paths served by Editable's own routes; pages cannot use them as slugs. */
const RESERVED_ROUTE_SLUGS = new Set(['api', 'assets', 'design-system', 'mcp', 'new', 'oauth']);

export function is_reserved_route_slug(slug: string) {
	return RESERVED_ROUTE_SLUGS.has(slug);
}
