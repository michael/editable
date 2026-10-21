// Create a migration in src/app/migrations:
//
//   pnpm migration:create <name>                    for the SQLite backend
//   pnpm migration:create <name> --target <target>  for another backend
//   pnpm migration:create <name> --after <id>       dated right after another migration
//
// --editable uses Editable's namespace instead of the project's own.

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_ID = /^(\d{8}T\d{9}Z)_([a-z][a-z0-9-]*)_([a-z0-9]+(?:_[a-z0-9]+)*)$/;
const migration_dir = join(process.cwd(), 'src/app/migrations');
const args = process.argv.slice(2);
let namespace = 'custom';
let name = '';
let target = 'sqlite';
let after = '';

for (let index = 0; index < args.length; index++) {
	const argument = args[index];
	const value = () => args[++index] || fail(`${argument} requires a value.`);
	if (argument === '--editable') namespace = 'editable';
	else if (argument === '--target') target = value();
	else if (argument === '--after') after = value();
	else if (argument.startsWith('--')) fail(`Unknown option: ${argument}`);
	else if (name) fail('Provide exactly one migration name.');
	else name = argument;
}

if (!name) fail('Usage: pnpm migration:create <name> [--target <backend>] [--after <id>]');
const slug = name
	.trim()
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '_')
	.replace(/^_+|_+$/g, '');
if (!slug) fail('Migration name must contain a letter or number.');
let timestamp = new Date().toISOString().replace(/[-:.]/g, '');
if (after) {
	if (!existsSync(join(migration_dir, `${after}.ts`))) fail(`No migration ${after}.`);
	const [, stamp] = MIGRATION_ID.exec(after) ?? fail(`Invalid migration id: ${after}`);
	const parsed = stamp.replace(
		/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/,
		'$1-$2-$3T$4:$5:$6.$7Z'
	);
	timestamp = new Date(Date.parse(parsed) + 1).toISOString().replace(/[-:.]/g, '');
}
const id = `${timestamp}_${namespace}_${slug}`;
const template =
	target === 'sqlite'
		? "import type { Migration, MigrationContext } from '#lib/server/migrations.js';\nimport type { SqliteStorage } from '#lib/server/backends/sqlite_backend.js';\n\nexport default {\n\ttarget: 'sqlite',\n\tup({ db, documents, ensure_document, rename_property, rename_type, replace_value, delete_property, update }: MigrationContext<SqliteStorage>) {\n\t\t// Change content with the helpers, such as rename_property('hero', 'image', 'media'),\n\t\t// and storage with db, such as db.exec('ALTER TABLE ...').\n\t}\n} satisfies Migration;\n"
		: `import type { Migration, MigrationContext } from '#lib/server/migrations.js';\n\nexport default {\n\ttarget: '${target}',\n\tup({ rename_property }: MigrationContext) {\n\t\t// Change content with the helpers and the ${target} backend's storage, spread next to them.\n\t}\n} satisfies Migration;\n`;

const path = join(migration_dir, `${id}.ts`);
try {
	writeFileSync(path, template, { flag: 'wx' });
} catch (error) {
	if (error?.code === 'EEXIST') fail(`Migration already exists: ${path}`);
	throw error;
}
console.log(`Created ${path}`);

function fail(message) {
	console.error(message);
	process.exit(1);
}
