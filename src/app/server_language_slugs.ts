import { db } from './services.js';
import { languages } from './server_languages.js';
import { is_reserved_language_slug } from './languages.js';
import { get_markdown_page_pathnames } from './markdown/registry.js';

type SlugRow = { slug: string; document_id: string; is_active: number };

/** Detect existing pages and redirects hidden by newly configured languages. */
export function warn_about_language_slug_collisions() {
	if (!languages.length) return;
	const rows = db
		.prepare(
			`SELECT s.slug, s.document_id, s.is_active
			 FROM document_slugs s
			 JOIN documents d ON d.document_id = s.document_id
			 WHERE d.type = 'page'`
		)
		.all() as SlugRow[];
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
