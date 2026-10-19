import type { Backend } from '#lib/server/backend.js';
import { backend_for } from './server_backend.js';
import { DATA_DIR, STORAGE } from './server_config.js';

/**
 * The backend of the deployment's own site, in DATA_DIR. Return your own here
 * to keep the site elsewhere; Editable migrates it before first use. Editable
 * keeps this file to this one function, so changing it never conflicts with
 * a release.
 */
export function create_backend(): Backend {
	return backend_for(DATA_DIR, STORAGE);
}
