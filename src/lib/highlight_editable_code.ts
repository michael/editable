import { tokenize_code, code_token_color } from './code_highlighting.js';

type HighlightOptions = {
	content: string;
	language: string;
	enabled: boolean;
	composing: boolean;
};

// Paint native ranges only: Svedit retains full ownership of the editable DOM.
export function highlight_editable_code(element: HTMLElement, options: HighlightOptions) {
	if (typeof CSS === 'undefined' || !CSS.highlights || typeof Highlight === 'undefined') return;
	const registry = CSS.highlights;
	const doc = element.ownerDocument;
	const view = doc.defaultView;
	if (!view) return;
	let current_options = options;
	let frame: number | null = null;
	let destroyed = false;
	let cached_content: string | null = null;
	let cached_language: string | null = null;
	let cached_tokens: ReturnType<typeof tokenize_code> = null;
	const owned_ranges = new Map<string, Range[]>();

	function clear_ranges() {
		for (const [name, ranges] of owned_ranges) {
			const highlight = registry.get(name);
			if (!highlight) continue;
			for (const range of ranges) highlight.delete(range);
			if (highlight.size === 0) registry.delete(name);
		}
		owned_ranges.clear();
	}

	function paint() {
		frame = null;
		clear_ranges();
		const { content, language, enabled, composing } = current_options;
		if (!enabled || composing || !content || language === 'plain') return;
		const text_element = element.querySelector('[data-type="text"]');
		if (!text_element) return;

		const text_nodes: { node: Text; start: number; end: number }[] = [];
		const walker = doc.createTreeWalker(text_element, NodeFilter.SHOW_TEXT);
		let text_content = '';
		while (walker.nextNode()) {
			const node = walker.currentNode as Text;
			const start = text_content.length;
			text_content += node.data;
			if (node.length) text_nodes.push({ node, start, end: text_content.length });
		}
		// Native composition or a pending Svelte render can temporarily differ from the model.
		if (text_content !== content) return;
		if (cached_content !== content || cached_language !== language) {
			cached_tokens = tokenize_code(content, language);
			cached_content = content;
			cached_language = language;
		}
		if (!cached_tokens) return;

		const { tokens, token_types } = cached_tokens;
		let start_index = 0;
		let end_index = 0;
		for (let index = 0; index < tokens.length; index += 3) {
			const start = tokens[index + 1];
			const end = tokens[index + 2];
			if (end <= start) continue;
			while (start_index < text_nodes.length && text_nodes[start_index].end <= start) start_index++;
			end_index = Math.max(end_index, start_index);
			while (end_index < text_nodes.length && text_nodes[end_index].end < end) end_index++;
			const start_node = text_nodes[start_index];
			const end_node = text_nodes[end_index];
			if (!start_node || !end_node) continue;
			const range = doc.createRange();
			range.setStart(start_node.node, start - start_node.start);
			range.setEnd(end_node.node, end - end_node.start);
			const name = `ew-code-${code_token_color(token_types[tokens[index]])}`;
			let highlight = registry.get(name);
			if (!highlight) {
				highlight = new Highlight();
				registry.set(name, highlight);
			}
			highlight.add(range);
			let ranges = owned_ranges.get(name);
			if (!ranges) {
				ranges = [];
				owned_ranges.set(name, ranges);
			}
			ranges.push(range);
		}
	}

	function schedule_paint() {
		if (!destroyed && frame === null) frame = view.requestAnimationFrame(paint);
	}

	// Svedit can split text nodes for an unfocused selection or replace them after undo.
	const observer = new MutationObserver(schedule_paint);
	observer.observe(element, { childList: true, characterData: true, subtree: true });
	schedule_paint();

	return {
		update(next_options: HighlightOptions) {
			current_options = next_options;
			if (!next_options.enabled || next_options.composing) clear_ranges();
			schedule_paint();
		},
		destroy() {
			destroyed = true;
			observer.disconnect();
			if (frame !== null) view.cancelAnimationFrame(frame);
			clear_ranges();
		}
	};
}
