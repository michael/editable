<script lang="ts">
	import { page } from '$app/state';
	import { get_app_context } from '#app/app_context.js';
	import { language_href } from '#app/languages.js';

	const app = get_app_context();
	let pending_language = $state('');
	const menu_id = $props.id();
	let menu_ref: HTMLElement | undefined = $state();
	let menu_open = $state(false);

	function language_name(language: string) {
		return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
	}

	async function choose(event: MouseEvent, language: string) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		if (app.saving || language === app.language) return;
		if (app.has_unsaved_changes) pending_language = language;
		else {
			menu_ref?.hidePopover();
			await app.switch_language(language);
		}
	}

	async function finish(action: 'save' | 'discard') {
		await app.switch_language(pending_language, action);
		pending_language = '';
		menu_ref?.hidePopover();
	}
</script>

{#if app.languages.length > 1}
	<div contenteditable="false" class="shrink-0 text-sm leading-5">
		<button
			type="button"
			popovertarget={menu_id}
			style:anchor-name={`--language-${menu_id}`}
			aria-label={`Language: ${language_name(app.language)}`}
			aria-expanded={menu_open}
			class="inline-flex min-h-9 cursor-pointer items-center gap-1 border-0 bg-transparent py-1.5 text-sm leading-5 font-normal text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
		>
			{app.language.toUpperCase()}
			<svg
				class="size-3 text-(--muted-foreground)"
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
				if (!menu_open) pending_language = '';
			}}
			class="ew-language-menu w-max max-w-[calc(100vw-2rem)] min-w-44 rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
		>
			<nav aria-label="Language" class="flex flex-col">
				{#each app.languages as language (language)}
					<a
						href={language_href(page.url.href, language, app.languages[0])}
						hreflang={language}
						lang={language}
						aria-current={app.language === language ? 'true' : undefined}
						aria-disabled={app.saving}
						onclick={(event) => choose(event, language)}
						class="flex min-h-10 items-center gap-3 rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] px-3 py-2.5 text-sm leading-5 hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) aria-current:bg-(--muted) aria-disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
					>
						<span
							class="inline-flex min-w-8 shrink-0 items-center justify-center rounded-(--button-border-radius) bg-(--foreground) px-2 py-0.5 text-xs leading-4 font-medium text-(--background)"
							aria-hidden="true">{language.toUpperCase()}</span
						>
						{language_name(language)}
					</a>
				{/each}
			</nav>
			{#if pending_language}
				<div
					class="max-w-72 space-y-3 border-t border-(--stroke) px-3 py-2.5"
					role="group"
					aria-label="Unsaved changes"
				>
					<p>You have unsaved changes.</p>
					<div class="flex flex-wrap justify-center gap-3">
						<button
							type="button"
							disabled={app.saving}
							onclick={() => finish('save')}
							class="rounded border border-(--stroke) px-3 py-2 hover:bg-(--muted)"
							>Save and switch</button
						>
						<button
							type="button"
							disabled={app.saving}
							onclick={() => finish('discard')}
							class="rounded border border-(--stroke) px-3 py-2 hover:bg-(--muted)"
							>Discard and switch</button
						>
						<button
							type="button"
							disabled={app.saving}
							onclick={() => (pending_language = '')}
							class="rounded border border-(--stroke) px-3 py-2 hover:bg-(--muted)">Cancel</button
						>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.ew-language-menu {
		position: fixed;
		inset: auto;
		top: anchor(bottom);
		right: max(1rem, anchor(right));
		margin: 8px 0 0;
		max-height: calc(100dvh - 6rem);
		overflow-y: auto;
		position-try-fallbacks: flip-block, flip-inline;
	}
</style>
