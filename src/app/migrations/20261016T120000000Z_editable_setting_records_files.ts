import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Migration } from '#lib/server/migrations.js';
import type { FilesStorage } from '#lib/server/backends/files_backend.js';

// Settings became { key, value } records like every other collection; folders
// written before kept each setting as a plain string.
export default {
	target: 'files',
	up({ db_dir }: FilesStorage) {
		const path = join(db_dir, 'settings.json');
		if (!existsSync(path)) return;
		const settings: Record<string, unknown> = JSON.parse(readFileSync(path, 'utf8'));
		const records = Object.fromEntries(
			Object.entries(settings).map(([key, value]) => [
				key,
				typeof value === 'string' ? { key, value } : value
			])
		);
		writeFileSync(`${path}.tmp`, JSON.stringify(records, null, '\t') + '\n');
		renameSync(`${path}.tmp`, path);
	}
} satisfies Migration;
