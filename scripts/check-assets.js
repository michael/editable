// Verify that every asset a database references exists on disk.
//
// Used as a data-integrity gate before a push (locally, against the snapshot)
// and after a push (in-container, against the live volume). Standalone: no
// #lib imports, so it runs against the built image too.
//
// Usage: node --disable-warning=ExperimentalWarning check-assets.js [--list-entries] <db_path> <assets_dir>
// Exit codes: 0 = all present, 1 = missing references, 2 = bad usage.

import { referenced_assets } from './asset-references.js';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, lstatSync } from 'node:fs';
import { extname, join } from 'node:path';

const args = process.argv.slice(2);
const list_entries = args[0] === '--list-entries';
const [db_path, assets_dir] = list_entries ? args.slice(1) : args;

if (!db_path || !assets_dir) {
	console.error('usage: check-assets.js [--list-entries] <db_path> <assets_dir>');
	process.exit(2);
}

const db = new DatabaseSync(db_path, { readOnly: true });
const referenced = referenced_assets(db);

const missing = [...referenced].filter((asset_id) => !existsSync(join(assets_dir, asset_id)));

const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

if (missing.length > 0) {
	console.error(`Missing ${plural(missing.length, 'referenced asset')}:`);
	for (const asset_id of missing) console.error(`  ${asset_id}`);
	process.exit(1);
}

if (list_entries) {
	// `referenced` comes exclusively from the database above. Responsive
	// variants are not stored as separate database references: the application
	// derives their URLs and storage directory from the referenced original's
	// hash. Include that directory when it exists, following the same storage
	// convention as asset_storage.js.
	const entries = new Set(referenced);
	for (const asset_id of referenced) {
		const ext = extname(asset_id);
		if (!ext) continue;
		const asset_stem = asset_id.slice(0, -ext.length);
		try {
			if (lstatSync(join(assets_dir, asset_stem)).isDirectory()) entries.add(asset_stem);
		} catch {
			// This referenced original has no responsive variants on disk.
		}
	}
	for (const entry of [...entries].sort()) console.log(entry);
	process.exit(0);
}

// Parsed by remote-db.sh (summary) and data.sh (verify) — keep the shape.
console.log(`OK: all ${plural(referenced.size, 'referenced asset')} present`);
