<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Reading } from '#app/meter_readings/store.js';

	let {
		user,
		readings,
		message
	}: {
		user: Record<string, unknown>;
		readings: Reading[];
		/** Why the last report was refused, if it was. */
		message: string | null;
	} = $props();

	// Logged out, the page sends you to /login again.
	async function handle_log_out() {
		const { log_out } = await import('#app/api.remote.js');
		await log_out();
		await invalidateAll();
	}

	const date = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

	const input_class =
		'h-11 min-w-0 flex-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base text-(--foreground) outline-none placeholder:text-(--muted-foreground) focus-visible:border-(--editing)';
</script>

<div class="bg-(--background) pt-block-generous pb-16 font-sans text-(--foreground)">
	<div class="mx-auto max-w-3xl space-y-10 px-5 sm:px-7">
		<header class="space-y-3">
			<h1 class="display-3">Meter readings</h1>
			<p class="body-base text-(--muted-foreground)">
				Report your meter reading each month, and see what you reported before.
			</p>
			<p class="body-base">
				Signed in as {user.name}.
				<button
					type="button"
					class="cursor-pointer text-(--foreground) underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
					onclick={handle_log_out}>Log out</button
				>
			</p>
		</header>

		<form method="POST" use:enhance class="space-y-2">
			<div class="flex flex-col gap-2 sm:flex-row">
				<input
					name="meter"
					required
					placeholder="Meter number, as on its label"
					aria-label="Meter number, as on its label"
					class={input_class}
				/>
				<input
					name="value"
					type="number"
					step="0.001"
					min="0"
					required
					placeholder="Current reading"
					aria-label="Current reading"
					class={input_class}
				/>
				<button
					class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-center text-base leading-6 font-normal wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)]"
				>
					Report
				</button>
			</div>
			{#if message}
				<p class="body-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]" role="alert">
					{message}
				</p>
			{/if}
		</form>

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
