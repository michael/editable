<script lang="ts">
	import App from '#app/components/App.svelte';
	let { data } = $props();
</script>

<!--
	BUG: When navigating from / with preloading on the Svedit component ends up
	with a stale session, breaking editing.
	See https://github.com/michael/editable-website/issues/40
-->
<App {...data} />
