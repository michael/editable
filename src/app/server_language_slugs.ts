import { backend } from './services.js';
import { default_site } from './server_site.js';
import { is_reserved_language_slug } from './languages.js';
import { get_markdown_page_pathnames } from './markdown/registry.js';

/** Detect existing pages and redirects hidden by newly configured languages. */
export async function warn_about_language_slug_collisions() {
	// Runs at startup, for the deployment's own site.
	const { languages } = default_site;
	if (!languages.length) return;
	const pages = new Set((await backend.list_documents('page')).map((record) => record.document_id));
	const rows = (await backend.list_slugs()).filter((record) => pages.has(record.document_id));
	for (const row of rows) {
		if (!is_reserved_language_slug(row.slug, languages)) continue;
		console.warn(
			`${row.is_active ? 'Page' : 'Historical redirect'} "/${row.slug}" (${row.document_id}) ` +
				`is shadowed by a language homepage. Remove ${row.slug} from LANGUAGES before ` +
				`renaming the page and updating its links, or choose a different language configuration. ` +
				`The /${row.slug} redirect cannot work while that language is enabled.`
		);
	}
	for (const pathname of get_markdown_page_pathnames()) {
		if (!is_reserved_language_slug(pathname.slice(1), languages)) continue;
		console.warn(
			`Markdown page "${pathname}" is shadowed by a language homepage. Change its ` +
				`MARKDOWN_SOURCES pathname or remove ${pathname.slice(1)} from LANGUAGES.`
		);
	}
}
