// Convert the site in the data folder to the other storage format, in place:
//
//   pnpm data:convert --to files
//   pnpm data:convert --to sqlite
//
// Works on DATA_DIR, data/ by default. The site's content, references, and
// settings are copied, including which content migrations have run; sign-ins
// and MCP connections start over. assets/ stays where it is, since both
// formats share it. The previous format then moves out of the folder into
// data-backups/: a database as a regular backup that pnpm data:backups lists,
// files as a dated folder. Stop the dev server first.

import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const to = args[0] === '--to' ? args[1] : null;
if (args.length !== 2 || (to !== 'files' && to !== 'sqlite'))
	fail('Usage: pnpm data:convert --to files|sqlite');
const dir = resolve(process.env.DATA_DIR || 'data');
const database = join(dir, 'db.sqlite3');
if (spawnSync('lsof', [database]).status === 0)
	fail('The database is open: stop the dev server before converting.');

// Vite resolves the app's modules the way the server build does.
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const storage = await vite.ssrLoadModule('/src/app/server_backend.ts');
	const { migrate, migrate_storage } = await vite.ssrLoadModule('/src/app/migrations.ts');
	const from = storage.data_format(dir);
	if (!from) fail(`${dir} holds no site.`);
	if (from === to) {
		console.log(`${dir} already holds a ${to} site.`);
		process.exit(0);
	}

	const source = storage.backend_in(dir, from);
	await migrate(source);
	// The new format gets its own storage migrations; content progress arrives with the records.
	const target = storage.backend_in(dir, to);
	await migrate_storage(target);
	await storage.copy_site(source, target);
	await source.close();
	await target.close();

	const backups = resolve('data-backups');
	mkdirSync(backups, { recursive: true });
	const stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
	const random = Math.floor(Math.random() * 0x10000)
		.toString(16)
		.padStart(4, '0');
	const kept =
		from === 'sqlite'
			? join(backups, `local-${stamp}-${random}-before-files.sqlite3`)
			: join(backups, `local-${stamp}-${random}-before-sqlite`);
	if (from === 'sqlite') {
		renameSync(database, kept);
		for (const suffix of ['-wal', '-shm']) rmSync(database + suffix, { force: true });
	} else {
		renameSync(join(dir, 'db'), kept);
	}
	console.log(`Converted ${dir} to ${to}. The ${from} version is kept in ${kept}.`);
} catch (error) {
	fail(error instanceof Error ? error.message : String(error));
} finally {
	await vite.close();
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
