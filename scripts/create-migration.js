// Create a migration in src/app/migrations:
//
//   pnpm migration:create <name>                    content, runs on every backend
//   pnpm migration:create <name> --storage          one file per storage backend
//   pnpm migration:create <name> --target <target>  one file for one backend
//   pnpm migration:create <name> --after <id>       dated right after another migration
//   pnpm migration:create --join <id> --target <t>  another backend's file for an existing change
//
// --editable uses Editable's namespace instead of the project's own.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_ID = /^(\d{8}T\d{9}Z)_([a-z][a-z0-9-]*)_([a-z0-9]+(?:_[a-z0-9]+)*)$/;
const migration_dir = join(process.cwd(), 'src/app/migrations');
const args = process.argv.slice(2);
let namespace = 'custom';
let name = '';
let storage = false;
let target = '';
let after = '';
let join_id = '';

for (let index = 0; index < args.length; index++) {
	const argument = args[index];
	const value = () => args[++index] || fail(`${argument} requires a value.`);
	if (argument === '--editable') namespace = 'editable';
	else if (argument === '--storage') storage = true;
	else if (argument === '--target') target = value();
	else if (argument === '--after') after = value();
	else if (argument === '--join') join_id = value();
	else if (argument.startsWith('--')) fail(`Unknown option: ${argument}`);
	else if (name) fail('Provide exactly one migration name.');
	else name = argument;
}

const files = readdirSync(migration_dir, { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
	.map((entry) => entry.name);
const target_of = (file) =>
	/target:\s*'([a-z][a-z0-9]*)'/.exec(readFileSync(join(migration_dir, file), 'utf8'))?.[1] ??
	'content';
const existing = (id) => files.includes(`${id}.ts`) || fail(`No migration ${id}.`);

let timestamp = new Date().toISOString().replace(/[-:.]/g, '');
let change;
if (join_id) {
	if (!target || target === 'content') fail('--join requires --target <backend>.');
	existing(join_id);
	const joined_target = target_of(`${join_id}.ts`);
	change = join_id.endsWith(`_${joined_target}`)
		? join_id.slice(0, -joined_target.length - 1)
		: join_id;
} else {
	if (!name)
		fail('Usage: pnpm migration:create <name> [--storage | --target <backend>] [--after <id>]');
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (!slug) fail('Migration name must contain a letter or number.');
	if (after) {
		existing(after);
		const [, stamp] = MIGRATION_ID.exec(after) ?? fail(`Invalid migration id: ${after}`);
		const parsed = stamp.replace(
			/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/,
			'$1-$2-$3T$4:$5:$6.$7Z'
		);
		timestamp = new Date(Date.parse(parsed) + 1).toISOString().replace(/[-:.]/g, '');
	}
	change = `${timestamp}_${namespace}_${slug}`;
}

const storage_targets = [...new Set(files.map(target_of).filter((t) => t !== 'content'))].sort();
const targets = storage ? storage_targets : [target || 'content'];
if (!targets.length) fail('No storage backends have migrations yet; use --target <backend>.');

const templates = {
	content:
		"import type { ContentContext, Migration } from '#lib/server/migrations.js';\n\nexport default {\n\tup({ documents, ensure_document, rename_property, rename_type, replace_value, delete_property, update }: ContentContext) {\n\t\t// Transform content with the helpers, or change `documents` directly.\n\t\t// rename_property('hero', 'image', 'media');\n\t}\n} satisfies Migration;\n",
	sqlite:
		"import type { Migration } from '#lib/server/migrations.js';\n\nexport default {\n\ttarget: 'sqlite',\n\tup() {\n\t\t// Leave empty if SQLite needs nothing for this change. Otherwise take its\n\t\t// storage: up({ db }: SqliteStorage), from '#lib/server/backends/sqlite_backend.js'.\n\t}\n} satisfies Migration;\n",
	files:
		"import type { Migration } from '#lib/server/migrations.js';\n\nexport default {\n\ttarget: 'files',\n\tup() {\n\t\t// Leave empty if the files backend needs nothing for this change. Otherwise\n\t\t// take its storage: up({ db_dir }: FilesStorage), from '#lib/server/backends/files_backend.js'.\n\t}\n} satisfies Migration;\n"
};
const template_for = (t) =>
	templates[t] ??
	`import type { Migration } from '#lib/server/migrations.js';\n\nexport default {\n\ttarget: '${t}',\n\tup() {\n\t\t// Leave empty if the ${t} backend needs nothing for this change.\n\t}\n} satisfies Migration;\n`;

for (const t of targets) {
	const id = t === 'content' ? change : `${change}_${t}`;
	const path = join(migration_dir, `${id}.ts`);
	try {
		writeFileSync(path, template_for(t), { flag: 'wx' });
	} catch (error) {
		if (error?.code === 'EEXIST') fail(`Migration already exists: ${path}`);
		throw error;
	}
	console.log(`Created ${path}`);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
