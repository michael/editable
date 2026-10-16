import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_ID_PATTERN = /^\d{8}T\d{9}Z_[a-z][a-z0-9-]*_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const args = process.argv.slice(2);
let namespace = 'custom';
let name = '';
const before = [];

for (let index = 0; index < args.length; index++) {
	const argument = args[index];
	if (argument === '--editable') {
		namespace = 'editable';
	} else if (argument === '--before') {
		const target = args[++index];
		if (!target) fail('--before requires a migration id.');
		if (!MIGRATION_ID_PATTERN.test(target)) fail(`Invalid migration id: ${target}`);
		before.push(target);
	} else if (argument.startsWith('--')) {
		fail(`Unknown option: ${argument}`);
	} else if (name) {
		fail('Provide exactly one migration name.');
	} else {
		name = argument;
	}
}

if (!name) fail('Usage: pnpm migration:create <name> [--before <migration-id>]');

const slug = name
	.trim()
	.toLowerCase()
	.replace(/[^a-z0-9]+/g, '_')
	.replace(/^_+|_+$/g, '');
if (!slug) fail('Migration name must contain a letter or number.');

const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
const id = `${timestamp}_${namespace}_${slug}`;
const migration_dir = join(process.cwd(), 'src/app/migrations');
const path = join(migration_dir, `${id}.ts`);
const before_property =
	before.length > 0 ? `\n\tbefore: [${before.map((target) => `'${target}'`).join(', ')}],` : '';
const source = `export default {${before_property}\n\tup({ store, ensure_document, rename_property, rename_type, replace_value, delete_property, update }) {\n\t\t// Transform content with the helpers, or records with \`store\`.\n\t\t// rename_property('hero', 'image', 'media');\n\t}\n};\n`;

mkdirSync(migration_dir, { recursive: true });
try {
	writeFileSync(path, source, { flag: 'wx' });
} catch (error) {
	if (error?.code === 'EEXIST') fail(`Migration already exists: ${path}`);
	throw error;
}

console.log(`Created ${path}`);

function fail(message) {
	console.error(message);
	process.exit(1);
}
