import { expect, it } from 'vitest';
import { create_upload_token, is_valid_upload_token } from './upload_token.js';

it('accepts unexpired tokens signed with the same secret only', () => {
	const now = Date.now();
	const token = create_upload_token('secret', now + 60_000);

	expect(is_valid_upload_token('secret', token, now)).toBe(true);
	expect(is_valid_upload_token('secret', token, now + 60_000)).toBe(false);
	expect(is_valid_upload_token('other', token, now)).toBe(false);
	expect(is_valid_upload_token('secret', token.replace(/^\d+/, String(now + 120_000)), now)).toBe(
		false
	);
	expect(is_valid_upload_token('secret', 'garbage', now)).toBe(false);
});
