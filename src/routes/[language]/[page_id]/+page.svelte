<script lang="ts">
	import App from '#app/components/App.svelte';
	let { data } = $props();
</script>

<App {...data} />
