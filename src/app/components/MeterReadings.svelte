<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { Reading } from '#app/meter_readings/store.js';

	let {
		user,
		readings,
		onreport
	}: {
		user: Record<string, unknown>;
		readings: Reading[];
		/** Opens the report dialog, which the route renders outside the editor's canvas. */
		onreport: () => void;
	} = $props();

	// Logged out, the page sends you to /login again.
	async function log_out() {
		const { logout_admin } = await import('#app/api.remote.js');
		await logout_admin();
		await invalidateAll();
	}

	const date = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
</script>

<div class="bg-(--background) pt-block-generous pb-16 font-sans text-(--foreground)">
	<div class="mx-auto max-w-3xl space-y-10 px-5 sm:px-7">
		<header class="space-y-3">
			<h1 class="display-3">Meter readings</h1>
			<p class="body-base text-(--muted-foreground)">
				Report your meter reading each month, and see what you reported before.
			</p>
		</header>

		<div class="space-y-4">
			<p class="body-base">
				Signed in as {user.name}.
				<button
					type="button"
					class="cursor-pointer text-(--foreground) underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
					onclick={log_out}>Log out</button
				>
			</p>
			<button
				type="button"
				class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-center text-base leading-6 font-normal wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]"
				onclick={onreport}
			>
				Report a reading
			</button>
		</div>

		{#if readings.length}
			<table class="w-full body-sm">
				<thead class="text-left text-(--muted-foreground)">
					<tr>
						<th class="py-2 font-normal">Meter</th>
						<th class="py-2 font-normal">Reading</th>
						<th class="py-2 font-normal">Reported</th>
					</tr>
				</thead>
				<tbody>
					{#each readings as reading (reading.id)}
						<tr class="border-t border-(--stroke)">
							<td class="py-2">{reading.meter}</td>
							<td class="py-2">{reading.value}</td>
							<td class="py-2">{date(reading.read_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{:else}
			<p class="body-base text-(--muted-foreground)">No readings reported yet.</p>
		{/if}
	</div>
</div>
