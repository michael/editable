import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Migration } from '#lib/server/migrations.js';
import type { FilesStorage } from '#lib/server/backends/files_backend.js';

// The login throttle moves out of the settings into a private collection of its own.
export default {
	target: 'files',
	up({ dir }: FilesStorage) {
		const path = join(dir, 'settings.json');
		if (!existsSync(path)) return;
		const settings = JSON.parse(readFileSync(path, 'utf8'));
		if (!settings.login_throttle) return;
		const { failed_count, locked_until } = JSON.parse(settings.login_throttle.value);
		const write = (file: string, value: unknown) => {
			writeFileSync(`${file}.tmp`, JSON.stringify(value, null, '\t') + '\n');
			renameSync(`${file}.tmp`, file);
		};
		write(join(dir, 'login_throttle.json'), {
			admin: { key: 'admin', failed_count, locked_until }
		});
		delete settings.login_throttle;
		write(path, settings);
	}
} satisfies Migration;
