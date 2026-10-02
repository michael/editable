import { beforeEach, afterEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import initial_schema from './migrations/20260803T131059242Z_editable_initial_schema.js';
import translations_schema from './migrations/20260923T180000000Z_editable_translations.js';

const project_dir = resolve('.');
const script_path = join(project_dir, 'scripts/data.sh');
let directory: string;
let local_dir: string;
let remote_dir: string;

function seed(data_dir: string, title: string) {
	mkdirSync(join(data_dir, 'assets'), { recursive: true });
	writeFileSync(join(data_dir, 'assets', 'asset.webp'), 'test asset');
	const db = new DatabaseSync(join(data_dir, 'db.sqlite3'));
	try {
		initial_schema.up({ db });
		translations_schema.up({ db });
		db.prepare('INSERT INTO documents (document_id, type, data) VALUES (?, ?, ?)').run(
			'page',
			'page',
			JSON.stringify({ title, nodes: { image: { type: 'image', src: 'asset.webp' } } })
		);
		for (const language of ['de', 'es'])
			db.prepare('INSERT INTO translations VALUES (?, ?, ?, ?)').run('page', language, '{}', 'now');
		db.prepare('INSERT INTO asset_refs VALUES (?, ?)').run('asset.webp', 'page');
	} finally {
		db.close();
	}
}
function stored_languages(data_dir: string) {
	const db = new DatabaseSync(join(data_dir, 'db.sqlite3'), { readOnly: true });
	try {
		return db.prepare('SELECT language FROM translations ORDER BY language').all();
	} finally {
		db.close();
	}
}
function options() {
	return {
		cwd: directory,
		env: {
			...process.env,
			DATA_DIR: local_dir,
			DEPLOY_DRIVER: 'ssh',
			DEPLOY_HOST: 'fixture',
			DEPLOY_NAME: 'fixture',
			REMOTE_APP_DIR: project_dir,
			REMOTE_DATA_DIR: remote_dir,
			HOST_DATA_DIR: remote_dir,
			REMOTE_EXEC: '',
			RESTART_CMD: `sh ${join(directory, 'restart.sh')}`,
			PATH: `${join(directory, 'bin')}:${process.env.PATH}`
		},
		encoding: 'utf8' as const
	};
}
function run(...args: string[]) {
	try {
		return execFileSync('bash', [script_path, ...args], options());
	} catch (err) {
		throw new Error(`${err.message}\n${err.stdout}\n${err.stderr}`, { cause: err });
	}
}
beforeEach(() => {
	directory = mkdtempSync(join(tmpdir(), 'data-command-targets-'));
	local_dir = join(directory, 'local');
	remote_dir = join(directory, 'remote');
	seed(local_dir, 'Local');
	seed(remote_dir, 'Remote');
	mkdirSync(join(directory, 'bin'));
	// Execute the remote helper locally; no real SSH or deployment is contacted.
	writeFileSync(
		join(directory, 'bin', 'ssh'),
		'#!/bin/bash\ncommand_text="${@: -1}"\nexec sh -c "$command_text"\n',
		{ mode: 0o755 }
	);
	writeFileSync(
		join(directory, 'bin', 'scp'),
		'#!/bin/bash\n[ "$1" = "-q" ] && shift\ncp "${1#fixture:}" "${2#fixture:}"\n',
		{ mode: 0o755 }
	);
	writeFileSync(
		join(directory, 'restart.sh'),
		`mv '${remote_dir}/incoming/db.sqlite3' '${remote_dir}/db.sqlite3'\n`
	);
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

it('defaults maintenance to local, backs up before restoring, and leaves the remote database alone', () => {
	expect(run('translations')).toContain('Local translations');
	expect(run('verify')).toContain('Local database and assets are healthy');
	expect(run('backup')).toContain('Local backup');
	const backup = readdirSync(join(directory, 'data-backups'))[0];
	expect(run('backups')).toContain(backup);
	run('purge-translations', 'es', '--yes');
	expect(stored_languages(local_dir)).toEqual([{ language: 'de' }]);
	expect(stored_languages(remote_dir)).toHaveLength(2);
	run('restore', backup, '--yes');
	expect(stored_languages(local_dir)).toHaveLength(2);
	expect(readdirSync(join(directory, 'data-backups'))).toHaveLength(3);
});

it('routes all six maintenance commands remotely only with --remote', () => {
	expect(run('translations', '--remote')).toContain('Remote translations');
	expect(run('verify', '--remote')).toContain("'fixture' is healthy");
	run('backup', '--remote');
	const backup = readdirSync(join(directory, 'data-backups'))[0];
	expect(run('backups', '--remote')).toContain(backup);
	run('purge-translations', 'es', '--yes', '--remote');
	expect(stored_languages(remote_dir)).toEqual([{ language: 'de' }]);
	expect(stored_languages(local_dir)).toHaveLength(2);
	run('restore', '--remote', backup, '--yes');
	expect(stored_languages(remote_dir)).toHaveLength(2);
	expect(stored_languages(local_dir)).toHaveLength(2);
});

it('rejects obsolete target flags and flags on commands with fixed scope before touching data', () => {
	for (const args of [
		['translations', '--local'],
		['reset', '--remote', '--yes'],
		['pull', '--remote'],
		['purge-translations', 'es', '--unknown', '--yes']
	]) {
		expect(spawnSync('bash', [script_path, ...args], options()).status).not.toBe(0);
	}
	expect(stored_languages(local_dir)).toHaveLength(2);
	expect(stored_languages(remote_dir)).toHaveLength(2);
});

it('refuses a local restore while the database is open', () => {
	run('backup');
	const backup = readdirSync(join(directory, 'data-backups'))[0];
	writeFileSync(join(directory, 'bin', 'lsof'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
	const result = spawnSync('bash', [script_path, 'restore', backup, '--yes'], options());
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('stop the dev server before restoring');
	expect(stored_languages(local_dir)).toHaveLength(2);
	expect(readdirSync(join(directory, 'data-backups'))).toHaveLength(1);
});

it('rejects missing assets before replacing local data on restore', () => {
	run('backup');
	const backup = readdirSync(join(directory, 'data-backups'))[0];
	run('purge-translations', 'es', '--yes');
	rmSync(join(local_dir, 'assets', 'asset.webp'));
	const result = spawnSync('bash', [script_path, 'restore', backup, '--yes'], options());
	expect(result.status).not.toBe(0);
	expect(result.stderr).toContain('Missing 1 referenced asset');
	expect(stored_languages(local_dir)).toEqual([{ language: 'de' }]);
	expect(readdirSync(join(directory, 'data-backups'))).toHaveLength(2);
	expect(spawnSync('bash', [script_path, 'verify'], options()).status).not.toBe(0);
});
