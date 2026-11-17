// Side-effect boot module for the automated backup layer. Imported by
// start-app.js after run-promote.js and before the server module opens the
// database. No-op unless BUCKET_NAME is set. Synchronous work uses spawnSync
// — a top-level await here would trip the same Node top-level-await exit
// issue run-promote.js documents.
//
// Litestream runs as a supervised sidecar, deliberately NOT via
// `litestream replicate -exec`: with -exec, litestream is the parent and a
// litestream crash takes the site down. Replication failure must degrade to
// "no replication + loud logs", never to an outage.
//
// In order:
//   1. Disaster recovery (blocking): empty volume → restore DB from bucket,
//      then download the assets it references.
//   2. Start litestream replication as a supervised sidecar: if it dies, the
//      site stays up and replication restarts with backoff.
//   3. Asset reconciliation sweep (non-blocking, alongside the server).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Mark this process (and every child spawned below) as the deployed runtime.
// The automatic bucket writes — asset mirror, daily snapshot — only activate
// under this flag, so dev servers and local previews can never write to the
// bucket, even with credentials present (see backup_enabled in src/lib/server/s3.ts).
process.env.EDITABLE_DEPLOYED = '1';

const DATA_DIR = process.env.DATA_DIR || '/data';
const DB_PATH = join(DATA_DIR, 'db.sqlite3');
const CONFIG = fileURLToPath(new URL('./litestream.yml', import.meta.url));
const script = (name) => fileURLToPath(new URL(name, import.meta.url));

/** @type {import('node:child_process').ChildProcess | undefined} */
let sidecar;
let shutting_down = false;
let backoff_ms = 1000;

function start_replication() {
	sidecar = spawn('litestream', ['replicate', '-config', CONFIG], { stdio: 'inherit' });
	sidecar.on('error', (err) => {
		console.error(
			'[backup] Failed to start litestream (replication OFF, site stays up):',
			err.message
		);
	});
	sidecar.on('exit', (code) => {
		if (shutting_down) return;
		console.error(
			`[backup] litestream exited (code ${code}) — replication down, site stays up. Restarting in ${backoff_ms / 1000}s…`
		);
		setTimeout(start_replication, backoff_ms).unref();
		backoff_ms = Math.min(backoff_ms * 2, 60_000);
	});
}

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		shutting_down = true;
		sidecar?.kill('SIGTERM');
	});
}

if (process.env.BUCKET_NAME) {
	// 1. Disaster recovery — only ever acts on a volume with no database.
	if (!existsSync(DB_PATH)) {
		console.log('[backup] No database on volume — attempting restore from bucket…');
		spawnSync('litestream', ['restore', '-if-db-not-exists', '-config', CONFIG, DB_PATH], {
			stdio: 'inherit'
		});
		if (existsSync(DB_PATH)) {
			console.log('[backup] Database restored — downloading referenced assets…');
			spawnSync('node', ['--disable-warning=ExperimentalWarning', script('./restore-assets.js')], {
				stdio: 'inherit'
			});
		} else {
			console.log('[backup] Nothing to restore (empty bucket) — starting fresh.');
		}
	}

	// 2. Continuous replication.
	start_replication();

	// 3. Reconciliation sweep — upload-only, must not delay the server.
	spawn('node', [script('./mirror-sweep.js')], { stdio: 'inherit' });
}
