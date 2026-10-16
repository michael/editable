// Convert a site's data folder between SQLite and files:
//
//   pnpm data:convert <from-data-dir> <to-data-dir>
//
// A folder with db.sqlite3 becomes a folder of files (site/), and the other
// way round. Every record is copied, including which content migrations have
// run, and assets/ is copied as it is. The source is brought up to date
// first, as the app does when it starts; the target must be empty.

import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const [from, to] = process.argv.slice(2).map((dir) => resolve(dir));
if (!from || !to) fail('Usage: pnpm data:convert <from-data-dir> <to-data-dir>');

const format_of = (dir) =>
	existsSync(join(dir, 'db.sqlite3'))
		? 'sqlite'
		: existsSync(join(dir, 'site', 'documents.json'))
			? 'files'
			: null;
const source = format_of(from);
if (!source) fail(`${from} holds no site: expected db.sqlite3 or site/documents.json.`);
if (existsSync(to) && readdirSync(to).length) fail(`${to} is not empty.`);
const target = source === 'sqlite' ? 'files' : 'sqlite';

// Vite resolves the app's modules the way the server build does.
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const storage = await vite.ssrLoadModule('/src/app/storage.ts');
	const { migrate, migrate_storage } = await vite.ssrLoadModule('/src/app/migrations.ts');
	const open = { sqlite: storage.open_sqlite_folder, files: storage.open_file_folder };
	const source_site = open[source](from);
	migrate(source_site);
	// The target gets its own format; content progress arrives with the records.
	const target_site = open[target](to);
	migrate_storage(target_site);
	storage.copy_store(source_site.store, target_site.store);
	if (existsSync(join(from, 'assets')))
		cpSync(join(from, 'assets'), join(to, 'assets'), { recursive: true });
	console.log(`Converted ${from} (${source}) to ${to} (${target}).`);
} finally {
	await vite.close();
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
