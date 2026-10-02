import { DatabaseSync } from 'node:sqlite';
import { utimesSync } from 'node:fs';
import { join, basename } from 'node:path';
import { list_translations, purge_translations } from './translation-maintenance.js';

const [db_path, action, language, confirmation, ...extra] = process.argv.slice(2);
if (
	!db_path ||
	extra.length ||
	!(
		(action === 'list' && !language && !confirmation) ||
		(action === 'purge' && language && confirmation === '--yes')
	)
) {
	console.error('Usage: translations.js <db_path> list | <db_path> purge <language> --yes');
	process.exit(2);
}
const db = new DatabaseSync(db_path, { readOnly: action === 'list' });
try {
	db.exec('PRAGMA busy_timeout = 10000');
	if (action === 'list') {
		console.log('Stored translations (includes disabled languages):');
		for (const row of list_translations(db))
			console.log(`${row.language}: ${row.documents} document(s)`);
	} else {
		const count = purge_translations(db, language, (asset_id) => {
			if (basename(asset_id) !== asset_id) throw new Error('Invalid asset id');
			try {
				// Start the usual orphan grace period without deleting media files.
				const now = new Date();
				utimesSync(join(db_path, '..', 'assets', asset_id), now, now);
			} catch (err) {
				if (err.code !== 'ENOENT') throw err;
			}
		});
		console.log(`OK: purged ${language} translations from ${count} document(s)`);
	}
} finally {
	db.close();
}
