/**
 * Sites live at <name>.<host>, so a site name is a hostname label. Names that
 * would be confusing as subdomains are reserved. Pure, so the registration
 * page can validate names in the browser too.
 */
const reserved_names = new Set(['www', 'api', 'mail', 'admin', 'host', 'hosted', 'app']);

export function is_site_name(name: string) {
	return /^[a-z][a-z0-9-]{2,29}$/.test(name) && !name.endsWith('-') && !reserved_names.has(name);
}
