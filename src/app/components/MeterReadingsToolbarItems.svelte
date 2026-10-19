<script lang="ts">
	import { site } from '#app/client_site.js';
	import { resolve_href } from '#app/document_links.js';
	import { tooltip } from '#app/tooltip.js';
	import type { ToolbarItemsProps } from './Toolbar.svelte';

	let { button_class }: ToolbarItemsProps = $props();
</script>

<a
	class={button_class}
	href={resolve_href('/meter-readings', site)}
	use:tooltip={{ label: 'Meter readings' }}
	aria-label="Meter readings"
>
	<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			d="M4.5 16.5C4.5 12.3579 7.85786 9 12 9C16.1421 9 19.5 12.3579 19.5 16.5M12 16.5L15 12.5"
			stroke="currentColor"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</a>
