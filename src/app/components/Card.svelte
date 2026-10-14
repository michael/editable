<script lang="ts">
	import type { Snippet } from 'svelte';
	import { reveal } from '#app/reveal.js';

	let {
		media,
		title,
		description,
		href = '',
		target = '_self',
		editable = false
	}: {
		media: Snippet;
		title: Snippet;
		description?: Snippet;
		href?: string;
		target?: string;
		editable?: boolean;
	} = $props();
	let render_as_link = $derived(!editable && !!href);
</script>

<svelte:element
	this={render_as_link ? 'a' : 'div'}
	href={render_as_link ? href : undefined}
	target={render_as_link && target !== '_self' ? target : undefined}
	class="ew-card group/card block min-w-0 outline-2 outline-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
	use:reveal
>
	<div class="aspect-4/3 overflow-hidden rounded-(--image-border-radius)">
		{@render media()}
	</div>
	<div class="pt-4">
		<div
			class={[
				'body-base',
				href && 'underline decoration-[0.0625em] underline-offset-[0.125em]',
				render_as_link &&
					'group-hover/card:decoration-[0.125em] group-active/card:decoration-[0.125em]'
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
