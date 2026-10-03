import { afterEach, describe, expect, it, vi } from 'vitest';
import { Window } from 'happy-dom';
import { highlight_editable_code } from './highlight_editable_code.js';
import * as code_highlighting from './code_highlighting.js';

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function setup() {
	const window = new Window();
	const registry = new Map<string, Set<Range>>();
	const frames = new Map<number, FrameRequestCallback>();
	let next_frame = 0;
	const frame_window = window as unknown as Pick<
		typeof globalThis,
		'requestAnimationFrame' | 'cancelAnimationFrame'
	>;
	vi.spyOn(frame_window, 'requestAnimationFrame').mockImplementation((callback) => {
		frames.set(++next_frame, callback);
		return next_frame;
	});
	vi.spyOn(frame_window, 'cancelAnimationFrame').mockImplementation((id) => {
		frames.delete(id);
	});
	vi.stubGlobal('CSS', { highlights: registry });
	vi.stubGlobal('Highlight', class extends Set<Range> {});
	vi.stubGlobal('MutationObserver', window.MutationObserver);
	vi.stubGlobal('NodeFilter', window.NodeFilter);
	cleanups.push(() => window.happyDOM.abort());

	function flush_frames() {
		const pending = [...frames.values()];
		frames.clear();
		for (const callback of pending) callback(0);
	}

	function mount(content: string) {
		const wrapper = window.document.createElement('div');
		const pre = window.document.createElement('pre');
		pre.dataset.type = 'text';
		pre.contentEditable = 'true';
		pre.textContent = content;
		pre.append(window.document.createElement('br'));
		wrapper.append(pre);
		window.document.body.append(wrapper);
		const options = { content, language: 'javascript', enabled: true, composing: false };
		const action = highlight_editable_code(wrapper as unknown as HTMLElement, options)!;
		if (action) cleanups.push(action.destroy);
		return { wrapper, pre, options, action };
	}

	function ranges(name: string) {
		return [...(registry.get(`ew-code-${name}`) ?? [])];
	}

	return { window, registry, frames, flush_frames, mount, ranges };
}

describe('editable syntax highlighting', () => {
	it('paints UTF-16 ranges without changing text markup, focus, or the selection', () => {
		const { window, mount, flush_frames, ranges } = setup();
		const { wrapper, pre } = mount('// 🦊\nconst value = "hello";');
		pre.focus();
		const selection = window.getSelection()!;
		const caret = window.document.createRange();
		caret.setStart(pre.firstChild!, 12);
		caret.collapse(true);
		selection.addRange(caret);
		const html = wrapper.innerHTML;
		flush_frames();
		expect(ranges('keyword').map((range) => range.toString())).toEqual(['const']);
		expect(ranges('string').map((range) => range.toString())).toEqual(['"hello"']);
		expect(wrapper.innerHTML).toBe(html);
		expect(window.document.activeElement).toBe(pre);
		expect(selection.anchorNode).toBe(pre.firstChild);
		expect(selection.anchorOffset).toBe(12);
	});

	it('rebuilds ranges across split text nodes without retokenizing unchanged content', async () => {
		const { window, mount, flush_frames, ranges } = setup();
		const tokenize = vi.spyOn(code_highlighting, 'tokenize_code');
		const { pre } = mount('const value = "hello";');
		flush_frames();
		expect(tokenize).toHaveBeenCalledTimes(1);
		pre.replaceChildren(window.document.createTextNode('co'));
		const span = window.document.createElement('span');
		span.textContent = 'nst value';
		pre.append(span, window.document.createTextNode(' = "hello";'));
		await window.happyDOM.waitUntilComplete();
		flush_frames();
		expect(ranges('keyword')[0].toString()).toBe('const');
		expect(ranges('keyword')[0].startContainer).toBe(pre.firstChild);
		expect(ranges('keyword')[0].endContainer).toBe(span.firstChild);
		expect(tokenize).toHaveBeenCalledTimes(1);
	});

	it('coalesces updates and waits until the DOM matches the latest model', async () => {
		const { window, mount, flush_frames, frames, ranges } = setup();
		const tokenize = vi.spyOn(code_highlighting, 'tokenize_code');
		const { pre, options, action } = mount('const x = 1;');
		action.update({ ...options, content: 'let x = 2;' });
		action.update({ ...options, content: 'let x = 3;' });
		expect(frames.size).toBe(1);
		flush_frames();
		expect(tokenize).not.toHaveBeenCalled();
		pre.textContent = 'let x = 3;';
		await window.happyDOM.waitUntilComplete();
		flush_frames();
		expect(tokenize).toHaveBeenCalledTimes(1);
		expect(ranges('keyword')[0].toString()).toBe('let');
		expect(ranges('number')[0].toString()).toBe('3');
	});

	it('pauses for composition, resumes after it, and clears for plain text or view mode', () => {
		const { mount, flush_frames, registry } = setup();
		const { options, action } = mount('const x = 1;');
		flush_frames();
		expect(registry.size).toBeGreaterThan(0);
		action.update({ ...options, composing: true });
		expect(registry.size).toBe(0);
		flush_frames();
		expect(registry.size).toBe(0);
		action.update(options);
		flush_frames();
		expect(registry.size).toBeGreaterThan(0);
		action.update({ ...options, language: 'plain' });
		flush_frames();
		expect(registry.size).toBe(0);
		action.update(options);
		flush_frames();
		action.update({ ...options, enabled: false });
		expect(registry.size).toBe(0);
	});

	it('cleans up only its own ranges when multiple blocks share the palette', () => {
		const { mount, flush_frames, frames, ranges, registry } = setup();
		const first = mount('const x = 1;');
		const second = mount('let y = 2;');
		flush_frames();
		expect(ranges('keyword').map((range) => range.toString())).toEqual(['const', 'let']);
		first.action.destroy();
		expect(ranges('keyword').map((range) => range.toString())).toEqual(['let']);
		second.action.update(second.options);
		second.action.destroy();
		expect(frames.size).toBe(0);
		expect(registry.size).toBe(0);
	});

	it('leaves editing alone when native highlights are unavailable', () => {
		const { window, mount, frames } = setup();
		vi.stubGlobal('Highlight', undefined);
		const { wrapper } = mount('const x = 1;');
		expect(wrapper.textContent).toBe('const x = 1;');
		expect(frames.size).toBe(0);
		expect(window.getSelection()?.rangeCount).toBe(0);
	});
});
