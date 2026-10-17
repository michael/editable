<script lang="ts">
	import App from '#app/components/App.svelte';

	const props: {
		data: {
			has_backend?: boolean;
			user?: Record<string, unknown> | null;
			origin?: string | null;
			document: any;
			slug: string | null;
			is_new?: boolean;
		};
	} = $props();
</script>

<!--
	BUG: When navigating from / with preloading on the Svedit component ends up
	with a stale session, breaking editing.
	See https://github.com/michael/editable-website/issues/40
-->
<!-- {#key initial_doc.document_id} -->
<App {...props.data} />
<!-- {/key} -->
