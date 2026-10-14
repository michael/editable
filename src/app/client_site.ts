import { page } from '$app/state';

/** The site of the page being shown, read from the layout data, for resolve_href and normalize_href. */
export const site = {
	get origin() {
		return page.data.origin ?? '';
	},
	get base() {
		return page.data.site_base ?? '';
	},
	get languages() {
		return page.data.languages ?? [];
	},
	get language() {
		return page.data.language ?? '';
	}
};
