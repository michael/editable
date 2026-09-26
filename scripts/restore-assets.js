// Download the assets referenced by a database from the backup bucket.
// Restores only the working set: originals the database references, plus
// their width variants. Unreferenced history stays in the bucket. Skips
// files already on disk, so it is resumable and cheap to re-run.
//
// Fails (exit 1) if any referenced original is still missing afterwards —
// a restore that would leave broken media must never report success.
//
// Used by disaster recovery at boot (run-cloud-boot.js), by
// `data.sh pull-cloud`, and by `data.sh restore-cloud` against the staged
// database. Standalone: no #lib imports.
//
// Usage: node --disable-warning=ExperimentalWarning restore-assets.js [db_path]
// db_path defaults to $DATA_DIR/db.sqlite3; assets always go to $DATA_DIR/assets.

import { referenced_assets } from './asset-references.js';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, extname, resolve, sep } from 'node:path';
import { s3_enabled, get_object, list_keys } from '../src/lib/server/s3.ts';

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = process.argv[2] || join(DATA_DIR, 'db.sqlite3');
const ASSETS_DIR = join(DATA_DIR, 'assets');

// Security boundary, not schema validation: a bucket key may have any shape
// (future asset layouts included) as long as it resolves strictly beneath
// the assets directory. A malformed or hostile bucket must never turn a
// download into a write elsewhere on the filesystem.
const ASSETS_ROOT = resolve(ASSETS_DIR);
function safe_dest(rel) {
	if (!rel || rel.endsWith('/')) return null;
	const dest = resolve(ASSETS_ROOT, rel);
	return dest.startsWith(ASSETS_ROOT + sep) ? dest : null;
}

const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;

if (!s3_enabled()) {
	console.error('BUCKET_NAME not set — nothing to restore from.');
	process.exit(2);
}

// Same reference walk as check-assets.js.
const db = new DatabaseSync(DB_PATH, { readOnly: true });
const referenced = referenced_assets(db);

// Content summary, so a restore immediately shows what state it produced.
// updated_at may not exist in databases predating the timestamps migration.
let last_edited = null;
try {
	last_edited = /** @type {{ m: string | null }} */ (
		db.prepare('SELECT max(updated_at) AS m FROM documents').get()
	).m;
} catch {
	// Old schema — no updated_at column.
}
db.close();

const stem = (id) => (extname(id) ? id.slice(0, -extname(id).length) : id);
const stems = new Set([...referenced].map(stem));

// One bucket listing, then select originals and variant files of referenced assets.
const wanted = [];
for (const key of await list_keys('assets/')) {
	const rel = key.slice('assets/'.length);
	const dest = safe_dest(rel);
	if (!dest) {
		if (rel) console.error(`[backup] Skipping unsafe bucket key: ${key}`);
		continue;
	}
	const is_variant = rel.includes('/');
	if (is_variant ? stems.has(rel.split('/')[0]) : referenced.has(rel)) {
		if (!existsSync(dest)) wanted.push({ rel, dest });
	}
}

console.log(
	`[backup] Restoring ${plural(wanted.length, 'asset file')} for ${plural(referenced.size, 'referenced asset')}…`
);

let failed = 0;
for (const { rel, dest } of wanted) {
	try {
		await mkdir(dirname(dest), { recursive: true });
		await writeFile(dest, await get_object(`assets/${rel}`));
	} catch (err) {
		failed += 1;
		console.error(`[backup] Failed to restore assets/${rel}:`, err.message);
	}
}

// The success criterion is the expected set, not the download list: a
// referenced original absent from the bucket would otherwise pass silently.
const still_missing = [...referenced].filter((id) => {
	const dest = safe_dest(id);
	return !dest || !existsSync(dest);
});
if (still_missing.length > 0) {
	console.error(
		`[backup] ${plural(still_missing.length, 'referenced asset')} missing after restore (not on disk, not in bucket):`
	);
	for (const id of still_missing) console.error(`  ${id}`);
	process.exit(1);
}
if (failed > 0) {
	console.error(`[backup] ${plural(failed, 'asset file')} failed to restore — re-run to retry.`);
	process.exit(1);
}
console.log(
	`[backup] Restored state: ${plural(rows.length, 'document')}, last edited ${last_edited ?? 'unknown'}, ${plural(referenced.size, 'referenced asset')}.`
);
