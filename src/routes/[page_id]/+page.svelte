<script lang="ts">
	import App from '#app/components/App.svelte';

	/** @type {{ data: { document: any, slug: string | null, user?: Record<string, unknown> | null, has_backend?: boolean, is_new?: boolean, can_edit?: boolean, origin?: string | null } }} */
	const props = $props();
</script>

<App {...props.data} is_new={false} />
