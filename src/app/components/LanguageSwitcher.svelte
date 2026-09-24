<script lang="ts">
	import { page } from '$app/state';
	import { get_app_context } from '#app/app_context.js';
	import { language_href } from '#app/languages.js';

	const app = get_app_context();
	let pending_language = $state('');

	function language_name(language: string) {
		return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
	}

	async function choose(event: MouseEvent, language: string) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		if (app.saving || language === app.language) return;
		if (app.has_unsaved_changes) pending_language = language;
		else await app.switch_language(language);
	}

	async function finish(action: 'save' | 'discard') {
		await app.switch_language(pending_language, action);
		pending_language = '';
	}
</script>

{#if app.languages.length > 1}
	<div
		contenteditable="false"
		class="border-t border-(--stroke) px-5 py-5 text-center body-sm sm:px-7"
	>
		<nav aria-label="Language" class="flex flex-wrap justify-center gap-4">
			{#each app.languages as language (language)}
				<a
					href={language_href(page.url.href, language, app.languages[0])}
					hreflang={language}
					lang={language}
					aria-current={app.language === language ? 'true' : undefined}
					aria-disabled={app.saving}
					onclick={(event) => choose(event, language)}
					class="rounded px-2 py-1 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-(--editing) aria-current:font-semibold"
					>{language_name(language)}</a
				>
			{/each}
		</nav>
		{#if app.is_admin && app.translation_mode}
			<p class="mt-3 text-(--muted-foreground)">
				Experimental translations · Save text and inline formatting here. Edit structure and media
				in {language_name(app.languages[0])}.
			</p>
		{/if}
		{#if pending_language}
			<div class="mt-4 space-y-3" role="group" aria-label="Unsaved changes">
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
{/if}
