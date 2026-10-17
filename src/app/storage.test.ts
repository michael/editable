import { afterEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { data_format, storage_for } from './storage.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function temp_dir() {
	const dir = mkdtempSync(join(tmpdir(), 'editable-storage-'));
	dirs.push(dir);
	return dir;
}

it('reads the format from the folder and refuses one holding both', () => {
	const dir = temp_dir();
	expect(data_format(dir)).toBeNull();
	writeFileSync(join(dir, 'db.sqlite3'), '');
	expect(data_format(dir)).toBe('sqlite');
	mkdirSync(join(dir, 'site'));
	expect(() => data_format(dir)).toThrow('conversion stops halfway');
	rmSync(join(dir, 'db.sqlite3'));
	expect(data_format(dir)).toBe('files');
});

it('opens a new folder in the requested format, SQLite by default', () => {
	expect(storage_for(temp_dir()).db.migrations.target).toBe('sqlite');
	expect(storage_for(temp_dir(), 'files').db.migrations.target).toBe('files');
	expect(() => storage_for(temp_dir(), 'postgres')).toThrow('STORAGE must be sqlite or files');
});

it('keeps an existing folder in its format and refuses a conflicting request', () => {
	const dir = temp_dir();
	storage_for(dir, 'files').db.close();
	expect(storage_for(dir).db.migrations.target).toBe('files');
	expect(() => storage_for(dir, 'sqlite')).toThrow('pnpm data:convert --to sqlite');
});
