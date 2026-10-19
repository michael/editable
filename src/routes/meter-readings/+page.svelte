<script lang="ts">
	import App from '#app/components/App.svelte';
	import MeterReadings from '#app/components/MeterReadings.svelte';
	import ReportReadingDialog from '#app/components/ReportReadingDialog.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let reporting = $state(false);
</script>

<App {...data}>
	<MeterReadings user={data.user} readings={data.readings} onreport={() => (reporting = true)} />
</App>

<ReportReadingDialog bind:open={reporting} message={form?.message ?? null} />
