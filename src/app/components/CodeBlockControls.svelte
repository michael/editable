<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { code_languages } from '#app/code_languages.js';
	import { get_svedit_context } from '#app/svedit_context.js';

	const svedit = get_svedit_context();

	let { node }: { node: Nodes['code_block'] } = $props();

	function update(property: 'language' | 'wrap_lines', value: string | boolean) {
		const tr = svedit.session.tr;
		tr.set([node.id, property], value);
		svedit.session.apply(tr);
		return_to_canvas();
	}

	// Native controls take focus from Svedit; hand it back once their event is done.
	function return_to_canvas() {
		setTimeout(() => svedit.focus_canvas(), 0);
	}
</script>

<div
	class="pointer-events-auto absolute z-30 mb-3 inline-flex max-w-[calc(100vw-2.5rem)] gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
	style="position-anchor: --code-{node.id}; position-area: block-start span-inline-end;"
>
	<label
		class="relative inline-flex min-h-9 min-w-0 cursor-pointer items-center gap-2 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] px-3 text-sm leading-5 font-medium transition-colors hover:bg-(--muted) active:bg-(--foreground)/10 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--editing)"
	>
		<span class="truncate">{code_languages[node.language]}</span>
		<svg
			class="size-4 shrink-0 stroke-(--muted-foreground)"
			viewBox="0 0 12 12"
			fill="none"
			aria-hidden="true"
		>
			<path d="M3 4.5L6 7.5L9 4.5" stroke-width="1.25" />
		</svg>
		<!-- The real control is a transparent select over the label, so the pill renders its ring. -->
		<select
			class="absolute inset-0 size-full cursor-pointer opacity-0"
			aria-label="Code language"
			value={node.language}
			onchange={(event) => update('language', event.currentTarget.value)}
			onkeydown={(event) => {
				if (event.key === 'Escape') return_to_canvas();
			}}
		>
			{#each Object.entries(code_languages) as [id, label] (id)}
				<option value={id}>{label}</option>
			{/each}
		</select>
	</label>
	<label
		class="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] px-3 text-sm leading-5 font-medium transition-colors hover:bg-(--muted) active:bg-(--foreground)/10"
	>
		<input
			type="checkbox"
			checked={node.wrap_lines}
			onchange={(event) => update('wrap_lines', event.currentTarget.checked)}
			class="size-4 shrink-0 cursor-pointer rounded-[min(0.25rem,var(--button-border-radius))] border-(--stroke)! bg-(--muted)! text-(--editing) ring-0 checked:border-transparent! checked:bg-(--editing)! focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
		/>
		Wrap lines
	</label>
</div>
