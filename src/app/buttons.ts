// AuthDialog's button recipes in the site's accent colors, for pages and
// dialogs shown outside the editing UI.
const TW_BTN_BASE =
	'inline-flex h-9 sm:h-[46px] shrink-0 items-center justify-center rounded-(--button-border-radius) px-5 text-sm leading-5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer';

export const TW_PRIMARY_BTN = `${TW_BTN_BASE} border border-transparent bg-(--accent) text-(--accent-foreground) enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]`;

export const TW_SECONDARY_BTN = `${TW_BTN_BASE} border border-(--stroke) bg-(--background) text-(--foreground) enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10`;
