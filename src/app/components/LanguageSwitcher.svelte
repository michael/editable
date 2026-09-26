<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { get_app_context } from '#app/app_context.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { language_href } from '#app/languages.js';

	const app = get_app_context();
	const svedit = get_svedit_context();
	let disabled = $derived(svedit.editable || app.saving);
	const menu_id = $props.id();
	let menu_ref: HTMLElement | undefined = $state();
	let menu_open = $state(false);
	let menu_trigger: HTMLButtonElement | undefined = $state();

	function get_menu_items() {
		return Array.from(
			menu_ref?.querySelectorAll<HTMLElement>('a[href]:not([aria-disabled="true"])') ?? []
		);
	}

	function open_menu(last = false) {
		if (disabled) return;
		menu_ref?.showPopover();
		const items = get_menu_items();
		items[last ? items.length - 1 : 0]?.focus({ preventScroll: true });
	}

	function handle_keydown(event: KeyboardEvent) {
		if (disabled || event.defaultPrevented || event.isComposing) return;
		if (
			(event.metaKey || event.ctrlKey) &&
			event.shiftKey &&
			!event.altKey &&
			event.key.toLowerCase() === 'l' &&
			menu_trigger?.getClientRects().length
		) {
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) open_menu();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target === menu_trigger && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
			event.preventDefault();
			event.stopPropagation();
			open_menu(event.key === 'ArrowUp');
			return;
		}
		if (!menu_ref?.matches(':popover-open') || !menu_ref.contains(event.target as Node)) return;
		if (event.key === 'Tab') {
			const items = get_menu_items();
			const boundary_item = event.shiftKey ? items[0] : items[items.length - 1];
			if (document.activeElement !== boundary_item) return;
		}
		if (event.key === 'Escape' || event.key === 'Tab') {
			if (event.key === 'Escape' || event.shiftKey) event.preventDefault();
			event.stopPropagation();
			menu_ref.hidePopover();
			menu_trigger?.focus({ preventScroll: true });
			return;
		}
		if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const items = get_menu_items();
		if (!items.length) return;
		const index = items.findIndex((item) => item === document.activeElement);
		const next_index =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? items.length - 1
					: (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
		items[next_index].focus({ preventScroll: true });
	}

	onMount(() => {
		window.addEventListener('keydown', handle_keydown, true);
		return () => window.removeEventListener('keydown', handle_keydown, true);
	});

	$effect(() => {
		if (disabled && menu_ref?.matches(':popover-open')) menu_ref.hidePopover();
	});

	function language_name(language: string) {
		return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
	}

	async function choose(event: MouseEvent, language: string) {
		if (disabled || language === app.language) {
			event.preventDefault();
			return;
		}
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		menu_ref?.hidePopover();
		await app.switch_language(language);
	}
</script>

{#if app.languages.length > 1}
	<div contenteditable="false" class="shrink-0 text-sm leading-5">
		<button
			type="button"
			bind:this={menu_trigger}
			{disabled}
			popovertarget={menu_id}
			aria-controls={menu_id}
			aria-keyshortcuts="Meta+Shift+L Control+Shift+L"
			onclick={(event) => {
				if (event.detail === 0 && !menu_ref?.matches(':popover-open')) {
					event.preventDefault();
					open_menu();
				}
			}}
			style:anchor-name={`--language-${menu_id}`}
			aria-label={`Language: ${language_name(app.language)}`}
			aria-expanded={menu_open}
			class="inline-flex min-h-9 items-center gap-1 border-0 bg-transparent py-1.5 text-sm leading-5 font-normal text-(--foreground) underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:underline enabled:active:underline disabled:cursor-default disabled:text-(--muted-foreground)"
		>
			{app.language.toUpperCase()}
			<svg
				class="size-3 text-(--muted-foreground)"
				class:invisible={svedit.editable}
				viewBox="0 0 12 12"
				fill="none"
				aria-hidden="true"
			>
				<path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.25" />
			</svg>
		</button>
		<div
			id={menu_id}
			bind:this={menu_ref}
			popover="auto"
			style:position-anchor={`--language-${menu_id}`}
			ontoggle={(event) => {
				menu_open = event.newState === 'open';
			}}
			class="ew-language-menu w-max max-w-[calc(100vw-2rem)] min-w-44 rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
		>
			<nav aria-label="Language" class="flex flex-col">
				{#each app.languages as language (language)}
					<a
						href={disabled || app.language === language
							? undefined
							: language_href(page.url.href, language, app.languages[0])}
						tabindex={disabled || app.language === language ? -1 : undefined}
						hreflang={language}
						lang={language}
						aria-current={app.language === language ? 'true' : undefined}
						aria-disabled={disabled || app.language === language}
						onclick={(event) => choose(event, language)}
						class="group flex min-h-10 items-center gap-3 rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] px-3 py-2.5 text-sm leading-5 not-aria-disabled:hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) aria-disabled:cursor-default aria-disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
					>
						<span
							class="inline-flex min-w-8 shrink-0 items-center justify-center rounded-(--button-border-radius) bg-(--foreground) px-2 py-0.5 text-xs leading-4 font-medium text-(--background) group-aria-disabled:bg-(--muted-foreground)"
							aria-hidden="true">{language.toUpperCase()}</span
						>
						{language_name(language)}
					</a>
				{/each}
			</nav>
		</div>
	</div>
{/if}

<style>
	.ew-language-menu {
		position: fixed;
		inset: auto 1rem;
		top: anchor(bottom);
		justify-self: anchor-center;
		margin: 8px 0 0;
		max-height: calc(100dvh - 6rem);
		overflow-y: auto;
		position-try-fallbacks: flip-block;
	}
</style>
