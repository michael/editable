<script lang="ts">
	import { page } from '$app/state';
	// Who is signed in, above the menu's own entries; the toolbar's gauge button leads to the readings.
</script>

{#if page.data.user}
	<p class="m-0 px-3 py-2 body-sm text-(--muted-foreground)">
		Signed in as {page.data.user.name}
	</p>
{/if}
