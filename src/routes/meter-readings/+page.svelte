<script lang="ts">
	import PageShell from '#app/components/PageShell.svelte';
	import MeterReadings from '#app/components/MeterReadings.svelte';

	let { data, form } = $props();
</script>

<PageShell
	title="Meter readings"
	description="Report your meter reading each month, and see what you reported before."
>
	<MeterReadings user={data.user} readings={data.readings} message={form?.message ?? null} />
</PageShell>
