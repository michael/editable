<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, NodeArrayProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path, mark: section = null } = $props();
	let node: Nodes['listing'] = $derived(svedit.session.get(path));
	let listing_layout = $derived(node.layout || 'narrow-left');
	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
</script>

{#snippet narrow_left()}
	<Node class="ew-listing" {path}>
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<div class="max-w-4xl px-5 text-(--foreground) sm:px-7">
					<NodeArrayProperty class="flex flex-col" path={[...path, 'items']} />
				</div>
			</div>
		</div>
	</Node>
{/snippet}

{#snippet narrow_center()}
	<Node class="ew-listing" {path}>
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<div class="mx-auto max-w-4xl px-5 text-(--foreground) sm:px-7">
					<NodeArrayProperty class="flex flex-col" path={[...path, 'items']} />
				</div>
			</div>
		</div>
	</Node>
{/snippet}

{#snippet narrow_right()}
	<Node class="ew-listing" {path}>
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<div class="ml-auto max-w-4xl px-5 text-(--foreground) sm:px-7">
					<NodeArrayProperty class="flex flex-col" path={[...path, 'items']} />
				</div>
			</div>
		</div>
	</Node>
{/snippet}

{#snippet full_width()}
	<Node class="ew-listing" {path}>
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					'px-5 sm:px-7',
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<div class="text-(--foreground)">
					<NodeArrayProperty class="flex flex-col" path={[...path, 'items']} />
				</div>
			</div>
		</div>
	</Node>
{/snippet}

{#snippet two_columns()}
	<Node class="ew-listing" {path}>
		<div class="mx-auto w-full max-w-7xl">
			<div
				class={[
					'px-5 sm:px-7',
					padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
					padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
				]}
			>
				<div class="text-(--foreground)">
					<NodeArrayProperty
						class="grid grid-cols-1 gap-x-10 gap-y-0 lg:grid-cols-2 lg:gap-x-14 lg:[--row:1]"
						path={[...path, 'items']}
					/>
				</div>
			</div>
		</div>
	</Node>
{/snippet}

{#if listing_layout === 'narrow-center'}
	{@render narrow_center()}
{:else if listing_layout === 'narrow-right'}
	{@render narrow_right()}
{:else if listing_layout === 'full-width'}
	{@render full_width()}
{:else if listing_layout === 'two-columns'}
	{@render two_columns()}
{:else}
	{@render narrow_left()}
{/if}
