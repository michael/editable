import {
	restore_document_links,
	translate_document_links,
	translated_href
} from './document_links.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Document } from 'svedit';
import {
	document_structure,
	normalized_payload,
	replace_translation,
	text_payload
} from './translations.js';
import { language_href, parse_languages } from './languages.js';
import * as id_generator from './nanoid.js';

afterEach(() => vi.restoreAllMocks());

function fixture(): Document {
	return {
		document_id: 'paragraph',
		nodes: {
			paragraph: {
				id: 'paragraph',
				type: 'paragraph',
				content: {
					content: 'Hello',
					marks: [{ start_offset: 0, end_offset: 5, node_id: 'bold' }],
					annotations: []
				}
			},
			bold: { id: 'bold', type: 'strong' },
			other: {
				id: 'other',
				type: 'paragraph',
				content: { content: 'Unchanged', marks: [], annotations: [] }
			}
		}
	};
}

describe('experimental translation boundaries', () => {
	it('parses opt-in languages and preserves query/hash when switching', () => {
		expect(parse_languages(undefined)).toEqual([]);
		expect(parse_languages('  ')).toEqual([]);
		expect(parse_languages('en')).toEqual([]);
		expect(() => parse_languages('en_US.UTF-8')).toThrow();
		expect(() => parse_languages('en,')).toThrow();
		expect(parse_languages('en,de,en')).toEqual(['en', 'de']);
		expect(language_href('/about?ref=test#contact', 'de', 'en')).toBe(
			'/about?ref=test&lang=de#contact'
		);
		expect(language_href('/about?lang=de#contact', 'en', 'en')).toBe('/about#contact');
	});

	it('replaces owned annotation nodes without mutating the original and round-trips semantically', () => {
		const original = fixture();
		const working = structuredClone(original);
		const payload = {
			content: 'Hallo Welt',
			marks: [{ start_offset: 0, end_offset: 10, node_id: 'translated_link' }],
			annotations: [],
			nodes: {
				translated_link: { id: 'translated_link', type: 'link', href: '/about', target: '_self' }
			}
		};
		replace_translation(working, 'paragraph', 'content', payload);
		expect(text_payload(working, 'paragraph', 'content')).toEqual(payload);
		expect(working.nodes.bold).toBeUndefined();
		expect(original.nodes.bold).toBeDefined();
		expect(working.nodes.other).toEqual(original.nodes.other);
		expect(normalized_payload(text_payload(working, 'paragraph', 'content'))).toBe(
			normalized_payload(payload)
		);
		expect(document_structure(working)).toBe(document_structure(original));
		working.nodes.other.content.content = '';
		expect(document_structure(working)).toBe(document_structure(original));
		working.nodes.other.type = 'heading_1';
		expect(document_structure(working)).not.toBe(document_structure(original));
	});

	it('uses the shared generator for collisions and reserves incoming and generated IDs', () => {
		const working = fixture();
		const unrelated = structuredClone(working.nodes.other);
		const payload = {
			content: 'Hallo',
			marks: [
				{ start_offset: 0, end_offset: 1, node_id: 'other' },
				{ start_offset: 1, end_offset: 2, node_id: 'bold' },
				{ start_offset: 2, end_offset: 5, node_id: 'incoming' }
			],
			annotations: [],
			nodes: {
				other: { id: 'other', type: 'strong' },
				bold: { id: 'bold', type: 'strong' },
				incoming: { id: 'incoming', type: 'strong' }
			}
		};
		const original_payload = structuredClone(payload);
		vi.spyOn(id_generator, 'default')
			.mockReturnValueOnce('other')
			.mockReturnValueOnce('incoming')
			.mockReturnValueOnce('fresh')
			.mockReturnValueOnce('fresh')
			.mockReturnValueOnce('another');
		replace_translation(working, 'paragraph', 'content', payload);
		expect(working.nodes.other).toEqual(unrelated);
		expect(working.nodes.paragraph.content.marks.map((mark) => mark.node_id)).toEqual([
			'fresh',
			'another',
			'incoming'
		]);
		expect(working.nodes.fresh).toEqual({ id: 'fresh', type: 'strong' });
		expect(working.nodes.another).toEqual({ id: 'another', type: 'strong' });
		expect(working.nodes.incoming).toEqual(payload.nodes.incoming);
		expect(payload).toEqual(original_payload);
		expect(normalized_payload(text_payload(working, 'paragraph', 'content'))).toBe(
			normalized_payload(payload)
		);
	});

	it('projects navigation links on the backend and removes only projected parameters on save', () => {
		const original = fixture();
		original.nodes.bold = {
			id: 'bold',
			type: 'link',
			href: '/about?ref=a%20b#contact',
			target: '_self'
		};
		const rendered = translate_document_links(original, 'de', 'https://example.com');
		expect(rendered.nodes.bold.href).toBe('/about?ref=a%20b&lang=de#contact');
		expect(original.nodes.bold.href).toBe('/about?ref=a%20b#contact');
		expect(restore_document_links(rendered, original, 'de', 'https://example.com')).toEqual(
			original
		);
		expect(translated_href('/about?lang=en', 'de', 'https://example.com')).toBe('/about?lang=en');
		expect(translated_href('https://elsewhere.com/about', 'de', 'https://example.com')).toBe(
			'https://elsewhere.com/about'
		);
		expect(translated_href('/assets/photo.webp', 'de', 'https://example.com')).toBe(
			'/assets/photo.webp'
		);
	});

	it('keeps empty translations and removes original marks even without replacements', () => {
		const working = fixture();
		replace_translation(working, 'paragraph', 'content', {
			content: '',
			marks: [],
			annotations: [],
			nodes: {}
		});
		expect(working.nodes.bold).toBeUndefined();
		expect(working.nodes.paragraph.content).toEqual({ content: '', marks: [], annotations: [] });
	});
});
