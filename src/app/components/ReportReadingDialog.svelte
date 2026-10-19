<script lang="ts">
	import { enhance } from '$app/forms';
	import Drawer from './Drawer.svelte';

	// Rendered next to App, outside the editor's canvas, which would otherwise take the keystrokes.
	let { open = $bindable(false), message = null }: { open?: boolean; message?: string | null } =
		$props();
</script>

{#if open}
	<Drawer bind:open label="Report a reading" drawer_height_mode="auto" center_content>
		<div class="mx-auto flex w-full max-w-lg flex-col gap-6 px-1 py-6 text-(--foreground)">
			<div class="flex flex-col items-center gap-1 text-center">
				<h2 class="m-0 display-5">Report a reading</h2>
				{#if message}
					<p class="m-0 body-sm text-[color-mix(in_oklch,red_65%,var(--foreground))]" role="alert">
						{message}
					</p>
				{/if}
			</div>
			<form
				method="POST"
				class="flex flex-col gap-2"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') open = false;
					}}
			>
				<input
					name="meter"
					required
					placeholder="Meter number, as on its label"
					aria-label="Meter number, as on its label"
					class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
				/>
				<input
					name="value"
					type="number"
					step="0.001"
					min="0"
					required
					placeholder="Current reading"
					aria-label="Current reading"
					class="h-9 min-w-0 appearance-none rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-4 text-base leading-5 text-(--foreground) transition-[border-color] duration-150 outline-none placeholder:text-(--muted-foreground) focus:ring-0 focus:outline-none focus-visible:border-(--editing) sm:h-11.5"
				/>
				<button
					class="inline-flex h-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--editing) px-5 text-sm leading-5 whitespace-nowrap text-(--editing-foreground) transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--editing),var(--editing-foreground)_30%)] sm:h-11.5"
				>
					Report
				</button>
			</form>
		</div>
	</Drawer>
{/if}
