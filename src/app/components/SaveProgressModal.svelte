<script lang="ts">
	import { fade } from 'svelte/transition';

	let {
		visible = false,
		message = '',
		done = false,
		progress = null
	}: { visible?: boolean; message?: string; done?: boolean; progress?: number | null } = $props();

	let show_modal = $state(false);
	let delay_timer;

	// Show modal after 1s delay, or immediately if done (to flash success)
	$effect(() => {
		if (visible && !done) {
			delay_timer = setTimeout(() => {
				show_modal = true;
			}, 1000);
		} else if (visible && done) {
			clearTimeout(delay_timer);
			show_modal = true;
		} else {
			clearTimeout(delay_timer);
			show_modal = false;
		}

		return () => {
			clearTimeout(delay_timer);
		};
	});
</script>

{#if show_modal}
	<div
		class="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 backdrop-blur-sm"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="max-w-md min-w-72 border border-(--stroke) bg-(--background) px-8 py-6 text-center shadow-[0_1px_2px_rgb(0_0_0/0.12),0_4px_16px_rgb(0_0_0/0.08)]"
			class:rounded-full={done}
			class:rounded-2xl={!done}
		>
			{#if done}
				<p class="text-sm font-medium text-(--foreground)">{message}</p>
			{:else}
				<div class="flex flex-col items-center gap-4">
					<div class="h-8 w-8" aria-hidden="true">
						<svg
							class="h-full w-full -rotate-90"
							class:animate-spin={progress === null}
							viewBox="0 0 36 36"
							fill="none"
						>
							<circle
								class="text-(--stroke)"
								cx="18"
								cy="18"
								r="15"
								stroke="currentColor"
								stroke-width="3"
							/>
							{#if progress !== null}
								<circle
									class="text-(--editing) transition-[stroke-dashoffset] duration-200"
									cx="18"
									cy="18"
									r="15"
									pathLength="100"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-dasharray="100"
									stroke-dashoffset={100 - Math.min(100, Math.max(0, progress))}
								/>
							{:else}
								<circle
									class="text-(--editing)"
									cx="18"
									cy="18"
									r="15"
									pathLength="100"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-dasharray="25 75"
								/>
							{/if}
						</svg>
					</div>
					<p class="text-lg text-(--foreground)">{message}</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
