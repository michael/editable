<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '#app/reveal.js';

	let {
		media,
		title,
		description,
		href = '',
		target = '_self',
		editable = false,
		outlined = false
	}: {
		media: Snippet;
		title: Snippet;
		description?: Snippet;
		href?: string;
		target?: string;
		editable?: boolean;
		outlined?: boolean;
	} = $props();
	let render_as_link = $derived(!editable && !!href);
</script>

<!-- An outlined card frames its media and text, with the media running edge to edge above a
divider. It fills its grid cell, so frames in a row share one height. -->
<svelte:element
	this={render_as_link ? 'a' : 'div'}
	href={render_as_link ? href : undefined}
	target={render_as_link && target !== '_self' ? target : undefined}
	class={[
		'ew-card group/card block min-w-0 outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)',
		outlined && 'h-full overflow-hidden rounded-(--image-border-radius) border border-(--stroke)'
	]}
	use:reveal
>
	<div
		class={[
			'aspect-4/3 overflow-hidden',
			outlined ? 'border-b border-(--stroke)' : 'rounded-(--image-border-radius)'
		]}
	>
		{@render media()}
	</div>
	<div class={outlined ? 'p-5 sm:p-6' : 'pt-4'}>
		<div
			class={[
				'display-5',
				href &&
					'underline decoration-[color-mix(in_oklab,currentColor_30%,transparent)] decoration-[0.0625em] underline-offset-[0.15em] transition-colors',
				render_as_link && 'group-hover/card:decoration-current group-active/card:decoration-current'
			]}
		>
			{@render title()}
		</div>
		{#if description}
			<div class="pt-1 body-base text-(--muted-foreground)">
				{@render description()}
			</div>
		{/if}
	</div>
</svelte:element>
