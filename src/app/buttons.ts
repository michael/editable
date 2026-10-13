// Button recipes for pages and dialogs shown outside the toolbar, in the
// shared editing treatment.

// Toolbar height on small screens, roomier once there is space for it.
export const TW_PILL_HEIGHT = 'h-9 sm:h-[46px]';

const TW_BTN_BASE = `inline-flex ${TW_PILL_HEIGHT} shrink-0 items-center justify-center rounded-(--button-border-radius) text-sm leading-5 whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer disabled:cursor-default disabled:opacity-40`;

export const TW_PRIMARY_BTN = `${TW_BTN_BASE} border border-transparent bg-(--editing) px-5 text-(--editing-foreground) enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)]`;

// Secondary action styling from the toolbar's cancel button.
const TW_SECONDARY_SURFACE =
	'border border-(--stroke) bg-(--background) text-(--foreground) enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10';

export const TW_SECONDARY_BTN = `${TW_BTN_BASE} ${TW_SECONDARY_SURFACE} px-5`;

export const TW_ICON_BTN = `${TW_BTN_BASE} ${TW_SECONDARY_SURFACE} aspect-square`;
