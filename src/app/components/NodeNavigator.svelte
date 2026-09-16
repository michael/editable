<script lang="ts">
	import { serialize_path } from 'svedit';
	import { get_selection_node_ancestors } from '#app/app_utils.js';
	import { tooltip } from '#app/tooltip.js';

	let { session, focus_canvas } = $props();

	let ancestors = $derived(get_selection_node_ancestors(session));
	let type_state = $derived(session.commands.cycle_node_type_next?.cycle_node_state ?? null);
	let layout_state = $derived(
		session.commands.cycle_layout_next?.closest_switchable_layout ?? null
	);
	let type_target_key = $derived(get_state_path_key(type_state));
	let layout_target_key = $derived(get_state_path_key(layout_state));
	let variant_item = $derived.by(() => {
		const items = ancestors.map((ancestor) => build_item(ancestor));
		return items.filter((item) => item.option_count > 1).at(-1) ?? items.at(-1) ?? null;
	});

	function get_state_path_key(state) {
		if (!state) return null;
		return serialize_path([...state.node_array_path, state.node_index]);
	}

	function get_layouts(node_type) {
		if (!('layout' in (session.schema[node_type]?.properties ?? {}))) return [null];
		const layouts = session.schema[node_type].properties.layout.values ?? [];
		return layouts.length > 0 ? layouts : [null];
	}

	function encode_variant(node_type, layout) {
		return JSON.stringify([node_type, layout]);
	}

	function humanize_node_id(value, capitalize = false) {
		if (typeof value !== 'string') return '';
		let words = value.replaceAll('_', ' ').replaceAll('-', ' ');
		words = words.replace(/\b(xl|lg|sm)\b/g, (word) => word.toUpperCase());
		return capitalize ? words.charAt(0).toUpperCase() + words.slice(1) : words;
	}

	function get_variant_label(node_type, layout) {
		const type_label = humanize_node_id(node_type, true);
		const layout_label = humanize_node_id(layout);
		return layout_label ? `${type_label} (${layout_label})` : type_label;
	}

	function build_item(ancestor) {
		const path_key = serialize_path(ancestor.path);
		const is_type_target = path_key === type_target_key;
		const is_layout_target = path_key === layout_target_key;
		const current_layout = ancestor.node.layout ?? null;
		const current_value = encode_variant(ancestor.node.type, current_layout);
		const groups = [];

		if (is_type_target) {
			const allowed_types = new Set([ancestor.node.type, ...(type_state?.available_types ?? [])]);
			const schema_order = session.inspect(type_state.node_array_path)?.node_types ?? [];
			for (const node_type of schema_order.filter((node_type) => allowed_types.has(node_type))) {
				const layouts =
					node_type === ancestor.node.type && !is_layout_target
						? [current_layout]
						: get_layouts(node_type);
				groups.push({
					node_type,
					options: layouts.map((layout) => ({
						layout,
						value: encode_variant(node_type, layout)
					}))
				});
			}
		} else if (is_layout_target) {
			groups.push({
				node_type: ancestor.node.type,
				options: get_layouts(ancestor.node.type).map((layout) => ({
					layout,
					value: encode_variant(ancestor.node.type, layout)
				}))
			});
		}

		return {
			...ancestor,
			is_type_target,
			is_layout_target,
			current_value,
			label: get_variant_label(ancestor.node.type, current_layout),
			type_label: humanize_node_id(ancestor.node.type, true),
			layout_label: humanize_node_id(current_layout),
			groups,
			option_count: groups.reduce((count, group) => count + group.options.length, 0)
		};
	}

	function handle_variant_change(event, item) {
		choose_variant(item, event.currentTarget.value);
		restore_canvas_selection();
	}

	function choose_variant(item, value) {
		const [node_type, layout] = JSON.parse(value);
		if (node_type !== item.node.type && item.is_type_target) {
			session.commands.cycle_node_type_next?.execute_with_type(node_type, layout);
		} else if (layout !== item.node.layout && item.is_layout_target) {
			session.commands.cycle_layout_next?.execute_with_layout(layout);
		}
	}

	function restore_canvas_selection() {
		// Native selects move DOM focus outside Svedit. Re-focus after the
		// select event finishes, then assign a fresh selection object so Svedit
		// renders the current model selection back into the DOM.
		setTimeout(() => {
			focus_canvas();
			if (session.selection) {
				session.selection = {
					...session.selection,
					path: [...session.selection.path]
				};
			}
		}, 0);
	}

	function handle_variant_keydown(event) {
		if (event.key === 'Escape') restore_canvas_selection();
	}
</script>

{#if variant_item}
	<div
		class="variant-pill flex min-h-9 min-w-0 items-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] text-sm leading-5 whitespace-nowrap text-(--foreground) max-sm:min-w-36"
		aria-label="Current node variant"
	>
		<div
			class="relative flex min-h-9 min-w-0 items-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] px-3 py-2 whitespace-nowrap {variant_item.option_count >
			1
				? 'cursor-pointer hover:bg-(--muted) active:bg-(--foreground)/10'
				: ''}"
		>
			<span class="flex min-w-0 items-center whitespace-nowrap" aria-hidden="true">
				<span class="truncate whitespace-nowrap max-sm:min-w-24">
					<span
						class={variant_item.option_count > 1
							? 'font-medium'
							: 'font-normal text-(--muted-foreground)'}>{variant_item.type_label}</span
					>
					{#if variant_item.layout_label}
						<span class="ml-1 font-mono text-xs font-normal text-(--muted-foreground)"
							>({variant_item.layout_label})</span
						>
					{/if}
				</span>
				{#if variant_item.option_count > 1}
					<svg
						class="ml-2 size-4 shrink-0 stroke-(--muted-foreground)"
						viewBox="0 0 12 12"
						fill="none"
					>
						<path d="M3 4.5L6 7.5L9 4.5" stroke-width="1.25" />
					</svg>
				{/if}
			</span>
			{#if variant_item.option_count > 1}
				<select
					class="variant-select absolute inset-0 size-full cursor-pointer opacity-0"
					value={variant_item.current_value}
					aria-label="Choose variant; current variant is {variant_item.label}"
					use:tooltip={{
						shortcuts: [
							{ label: 'Change type', keys: ['⌃', '⇧', ['↑', '↓']] },
							{ label: 'Change layout', keys: ['⌃', '⇧', ['←', '→']] }
						]
					}}
					onchange={(event) => handle_variant_change(event, variant_item)}
					onblur={restore_canvas_selection}
					onkeydown={handle_variant_keydown}
				>
					{#each variant_item.groups as group (group.node_type)}
						<optgroup label={humanize_node_id(group.node_type, true)}>
							{#each group.options as option (option.value)}
								<option value={option.value}>
									{get_variant_label(group.node_type, option.layout)}
								</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			{/if}
		</div>
	</div>
{/if}

<style>
	.variant-select,
	.variant-select:focus,
	.variant-select:focus-visible {
		appearance: none;
		-webkit-appearance: none;
		border: 0;
		outline: 0;
		box-shadow: none;
		background-image: none;
	}

	/* The real control is a transparent <select>, so the pill renders its ring. */
	.variant-pill:has(.variant-select:focus-visible) {
		outline: 2px solid var(--editing);
		outline-offset: 2px;
	}
</style>
