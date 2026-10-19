import { password_auth, type Auth } from './server_auth.js';

/**
 * How people sign in to the deployment's own site: the admin password from
 * ADMIN_PASSWORD. Return your own here, such as one for an app's accounts.
 * Editable keeps this file to this one function, so changing it never
 * conflicts with a release.
 */
export function create_auth(): Auth {
	return password_auth;
}
