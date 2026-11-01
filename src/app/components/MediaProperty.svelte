<script lang="ts">
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { get_app_context } from '#app/app_context.js';
	import { CustomProperty, serialize_path } from 'svedit';
	import Media from './Media.svelte';

	const svedit = get_svedit_context();
	const app = get_app_context();

	let { path, class: css_class = '' }: { path: DocumentPath; class?: string } = $props();
	let node = $derived(svedit.session.get(path));

	let is_selected = $derived(is_property_selected());
	// Outside edit mode, only the demo shows empty media, as a hint at what can be filled in.
	let show_checkerboard = $derived(
		svedit.editable ? is_selected || !node.src : app.is_demo_mode && !node.src
	);

	function is_property_selected() {
		const path_of_selection = svedit?.session?.selection?.path;
		return path_of_selection && serialize_path(path_of_selection) === serialize_path(path);
	}
</script>

<CustomProperty class="h-full {css_class}" {path}>
	<div
		contenteditable="false"
		class="h-full overflow-hidden"
		class:ew-bg-checkerboard={show_checkerboard}
	>
		<Media {node} editable={svedit.editable} />
	</div>
</CustomProperty>
