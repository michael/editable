import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Migration } from '#lib/server/migrations.js';
import type { FilesStorage } from '#lib/server/backends/files_backend.js';

// Documents and translations carry a version that changes with every write,
// so saves can tell when someone else changed them first.
export default {
	target: 'files',
	up({ db_dir }: FilesStorage) {
		for (const name of ['documents', 'translations']) {
			const path = join(db_dir, `${name}.json`);
			if (!existsSync(path)) continue;
			const records: Record<string, object> = JSON.parse(readFileSync(path, 'utf8'));
			for (const key of Object.keys(records))
				records[key] = { ...records[key], version: randomUUID() };
			writeFileSync(`${path}.tmp`, JSON.stringify(records, null, '\t') + '\n');
			renameSync(`${path}.tmp`, path);
		}
	}
} satisfies Migration;
