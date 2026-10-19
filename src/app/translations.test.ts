import { normalize_hrefs, resolve_hrefs, resolve_href } from './document_links.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fill_document_defaults, type Document } from 'svedit';
import { document_schema } from './document_schema.js';
import { document_structure, normalized_payload, property_payload } from './translations.js';
import { replace_translation } from './test_helpers/translations.js';
import { language_href, parse_languages } from './languages.js';
import * as id_generator from './nanoid.js';

const example_site = { origin: 'https://example.com', base: '', languages: ['en', 'de'] };

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
		expect(language_href('/about?ref=test#contact', 'de', ['en', 'de'])).toBe(
			'/de/about?ref=test#contact'
		);
		expect(language_href('/de/about#contact', 'en', ['en', 'de'])).toBe('/about#contact');
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
		expect(property_payload(working, 'paragraph', 'content')).toEqual(payload);
		expect(working.nodes.bold).toBeUndefined();
		expect(original.nodes.bold).toBeDefined();
		expect(working.nodes.other).toEqual(original.nodes.other);
		expect(normalized_payload(property_payload(working, 'paragraph', 'content'))).toBe(
			normalized_payload(payload)
		);
		expect(document_structure(working)).toBe(document_structure(original));
		working.nodes.other.content.content = '';
		expect(document_structure(working)).toBe(document_structure(original));
		working.nodes.other.type = 'heading_1';
		expect(document_structure(working)).not.toBe(document_structure(original));
	});

	it('compares the ranges of a node array regardless of their order', () => {
		const page = (marks: { start_offset: number; end_offset: number; node_id: string }[]) =>
			fill_document_defaults(
				{
					document_id: 'p',
					nodes: {
						p: {
							id: 'p',
							type: 'page',
							image: 'i',
							body: { nodes: ['a', 'b'], marks, annotations: [] }
						},
						i: { id: 'i', type: 'image' },
						a: { id: 'a', type: 'prose' },
						b: { id: 'b', type: 'prose' },
						s1: { id: 's1', type: 'section' },
						s2: { id: 's2', type: 'section' }
					}
				},
				document_schema
			);
		const first = { start_offset: 0, end_offset: 1, node_id: 's1' };
		const second = { start_offset: 1, end_offset: 2, node_id: 's2' };
		expect(document_structure(page([second, first]))).toBe(
			document_structure(page([first, second]))
		);
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
		expect(normalized_payload(property_payload(working, 'paragraph', 'content'))).toBe(
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
		const rendered = resolve_hrefs(original, example_site, 'de');
		expect(rendered.nodes.bold.href).toBe('/de/about?ref=a%20b#contact');
		expect(original.nodes.bold.href).toBe('/about?ref=a%20b#contact');
		expect(normalize_hrefs(rendered, original, example_site, 'de')).toEqual(original);
		expect(resolve_href('/about?lang=en', example_site, 'de')).toBe('/de/about?lang=en');
		expect(resolve_href('https://elsewhere.com/about', example_site, 'de')).toBe(
			'https://elsewhere.com/about'
		);
		expect(resolve_href('/assets/photo.webp', example_site, 'de')).toBe('/assets/photo.webp');
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
