<script lang="ts">
	import type { Nodes } from '#app/document_schema.js';
	import type { DocumentPath } from 'svedit';
	import { get_svedit_context } from '#app/svedit_context.js';
	import { Node, TextProperty } from 'svedit';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['banner'] = $derived(svedit.session.get(path));
	let is_empty = $derived(!node.content.content.trim());
</script>

<!-- An empty banner is the "off" state: hidden for visitors, and shown as a muted
slot while editing until someone writes a message. The divider is an inset shadow
rather than a border, so switching to the accent surface causes no layout shift. -->
{#if svedit.editable || !is_empty}
	<Node
		{path}
		class={is_empty
			? 'bg-(--muted) text-(--foreground) shadow-[inset_0_-1px_0_var(--stroke)]'
			: 'bg-(--accent) text-(--accent-foreground)'}
	>
		<!-- Highlight uses the accent colors, so invert them to stay visible on the accent surface. -->
		<div
			class="mx-auto max-w-7xl px-5 py-2.5 text-center [--accent-foreground:var(--foreground)] [--accent:var(--background)] sm:px-7 [&_code]:text-(--foreground)"
		>
			<TextProperty
				tag="p"
				class="block body-sm"
				path={[...path, 'content']}
				placeholder="Add an optional announcement — visible on all pages"
			/>
		</div>
	</Node>
{/if}
