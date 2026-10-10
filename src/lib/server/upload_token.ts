import { createHmac, timingSafeEqual } from 'node:crypto';
import { error } from '@sveltejs/kit';
import { require_admin_session } from './auth.js';

function sign(secret: string, expires_at: number) {
	return createHmac('sha256', secret).update(`asset-upload:${expires_at}`).digest('base64url');
}

/** A short-lived token that authorizes asset uploads only, signed so nothing has to be stored. */
export function create_upload_token(secret: string, expires_at: number): string {
	return `${expires_at}.${sign(secret, expires_at)}`;
}

export function is_valid_upload_token(secret: string, token: string, now = Date.now()): boolean {
	const [expires, signature, ...rest] = token.split('.');
	const expires_at = Number(expires);
	if (rest.length || !signature || !Number.isSafeInteger(expires_at) || expires_at <= now)
		return false;
	const expected = Buffer.from(sign(secret, expires_at));
	const actual = Buffer.from(signature);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Allow an upload from an admin session or with a bearer upload token. Token
 * uploads come from agents, so the caller validates their files more strictly.
 */
export function authorize_asset_upload(
	request: Request,
	locals: { is_admin?: boolean },
	secret: string | undefined
): 'admin_session' | 'upload_token' {
	const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (!token) {
		require_admin_session(locals);
		return 'admin_session';
	}
	if (!secret || !is_valid_upload_token(secret, token)) {
		error(401, 'The upload token is invalid or expired. Call prepare_image_upload for a new one.');
	}
	return 'upload_token';
}
