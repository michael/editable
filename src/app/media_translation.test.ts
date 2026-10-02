import { describe, expect, it } from 'vitest';
import { Session, type Document } from 'svedit';
import { default_site_document } from './default_site.js';
import { document_schema, MEDIA_DEFAULTS } from './document_schema.js';
import {
	delete_media,
	paste_media,
	update_media,
	is_media_property,
	is_media_selection
} from './media.js';
import { document_structure, normalized_payload, property_payload } from './translations.js';
import { replace_translation } from './test_helpers/translations.js';

function media_document() {
	const doc: Document = structuredClone(default_site_document);
	const page_id = doc.document_id;
	const image_id = doc.nodes[page_id].image;
	return { doc, page_id, image_id };
}

describe('translated media', () => {
	it('supports only singular properties restricted to image/video types', () => {
		expect(is_media_property({ type: 'node', node_types: ['image'] })).toBe(true);
		expect(is_media_property({ type: 'node', node_types: ['video'] })).toBe(true);
		expect(is_media_property({ type: 'node', node_types: ['image', 'video'] })).toBe(true);
		expect(is_media_property({ type: 'node', node_types: ['image', 'paragraph'] })).toBe(false);
		expect(is_media_property({ type: 'node', node_types: [] })).toBe(false);
		expect(is_media_property({ type: 'node_array', node_types: ['image'] })).toBe(false);
	});

	it('clears owned media without changing its ID and supports undo/redo', () => {
		const { doc, page_id, image_id } = media_document();
		doc.nodes[image_id].src = 'shared.webp';
		const session = new Session(document_schema, doc, {
			handle_property_deletion: (tr, path) => delete_media(tr, path)
		});
		session.apply(
			session.tr.set_selection({ type: 'property', path: [page_id, 'image'] }).delete_selection()
		);
		const cleared = session.get([page_id, 'image']);
		expect(cleared).toMatchObject(MEDIA_DEFAULTS);
		expect(cleared.id).toBe(image_id);
		expect(session.get(['nav_logo', 'media'])).toEqual(doc.nodes[doc.nodes.nav_logo.media]);
		expect(document_structure(session.doc)).toBe(document_structure(doc));
		session.undo();
		expect(session.get([page_id, 'image'])).toEqual(doc.nodes[image_id]);
		session.redo();
		expect(session.get([page_id, 'image'])).toMatchObject(MEDIA_DEFAULTS);
	});

	it('remaps occupied media IDs and leaves the payload and unrelated nodes untouched', () => {
		const { doc, page_id, image_id } = media_document();
		const payload = property_payload(doc, page_id, 'image');
		if (!('node_id' in payload)) throw new Error('Expected media');
		payload.nodes[image_id].alt = 'Translated';
		const snapshot = structuredClone(payload);
		const original_logo = structuredClone(doc.nodes[doc.nodes.nav_logo.media]);
		replace_translation(doc, page_id, 'image', payload);
		expect(doc.nodes[page_id].image).not.toBe(image_id);
		expect(doc.nodes[image_id]).toBeUndefined();
		expect(doc.nodes[doc.nodes.nav_logo.media]).toEqual(original_logo);
		expect(payload).toEqual(snapshot);
		expect(normalized_payload(property_payload(doc, page_id, 'image'))).toBe(
			normalized_payload(payload)
		);
	});

	it('rejects an incompatible media type and unrelated included nodes', () => {
		const { doc, page_id, image_id } = media_document();
		const snapshot = structuredClone(doc);
		const payload = {
			node_id: 'translated',
			nodes: { translated: { ...doc.nodes[image_id], id: 'translated', type: 'video' } }
		};
		expect(() => replace_translation(doc, page_id, 'image', payload)).toThrow(
			'Invalid translated media'
		);
		expect(doc).toEqual(snapshot);
		payload.nodes.translated.type = 'image';
		const with_extra = {
			...payload,
			nodes: { ...payload.nodes, extra: { ...payload.nodes.translated, id: 'extra' } }
		};
		expect(() => replace_translation(doc, page_id, 'image', with_extra)).toThrow(
			'Invalid media payload'
		);
		expect(doc).toEqual(snapshot);
	});
});

function clipboard_html(payload: unknown) {
	return `<span data-svedit="${btoa(encodeURIComponent(JSON.stringify(payload)))}"></span>`;
}

it('pastes copied media into a translation without changing unrelated fields and supports undo', () => {
	const { doc, page_id, image_id } = media_document();
	const session = new Session(document_schema, doc, {});
	const copied = { ...doc.nodes[image_id], src: 'copied.webp', alt: 'Übersetztes Bild' };
	const tr = session.tr;
	expect(
		paste_media(
			tr,
			[page_id, 'image'],
			clipboard_html({
				kind: 'property',
				type: 'node',
				value: copied
			})
		)
	).toBe(true);
	session.apply(tr);
	expect(session.get([page_id, 'image'])).toMatchObject({ src: copied.src, alt: copied.alt });
	expect(session.get([page_id, 'image']).id).not.toBe(image_id);
	expect(session.get(['nav_logo', 'media'])).toEqual(doc.nodes[doc.nodes.nav_logo.media]);
	expect(document_structure(session.doc)).toBe(document_structure(doc));
	session.undo();
	expect(session.get([page_id, 'image'])).toEqual(doc.nodes[image_id]);
});

it('rejects incompatible media, structural clipboard content, and malformed data', () => {
	const { doc, page_id, image_id } = media_document();
	const session = new Session(document_schema, doc, {});
	for (const html of [
		clipboard_html({
			kind: 'property',
			type: 'node',
			value: { ...doc.nodes[image_id], type: 'video' }
		}),
		clipboard_html({
			kind: 'property',
			type: 'node',
			value: { id: 'paragraph', type: 'paragraph' }
		}),
		clipboard_html({ main_nodes: [image_id], nodes: doc.nodes }),
		'<span data-svedit="invalid"></span>',
		''
	]) {
		expect(paste_media(session.tr, [page_id, 'image'], html)).toBe(false);
	}
	expect(
		paste_media(
			session.tr,
			[page_id, 'body'],
			clipboard_html({
				kind: 'property',
				type: 'node',
				value: doc.nodes[image_id]
			})
		)
	).toBe(false);
	expect(session.to_json()).toEqual(doc);
});

it('recognizes media field selections independently of language and rejects structural edits', () => {
	const { doc, page_id } = media_document();
	const session = new Session(document_schema, doc, {});
	session.selection = { type: 'property', path: [page_id, 'image'] };
	expect(is_media_selection(session)).toBe(true);
	session.selection = { type: 'node', path: [page_id, 'body'], anchor_offset: 0, focus_offset: 0 };
	expect(is_media_selection(session)).toBe(false);
	expect(update_media(session.tr, [page_id, 'body'], { src: 'image.webp' })).toBe(false);
	expect(update_media(session.tr, [page_id, 'image'], { type: 'video' })).toBe(false);
	expect(session.to_json()).toEqual(doc);
});

it('keeps an unshared image ID through pan, zoom, alt changes and same-type file replacement', () => {
	const doc: Document = structuredClone(default_site_document);
	const page_id = doc.document_id;
	const image_id = doc.nodes[page_id].image;
	const session = new Session(document_schema, doc, {});
	const updates = [
		{ focal_point_x: 0.2, focal_point_y: 0.7 },
		{ scale: 1.5 },
		{ alt: 'Updated alt' },
		{ ...MEDIA_DEFAULTS, type: 'image', src: 'replacement.webp', width: 800, height: 600 }
	];
	for (const properties of updates) {
		const tr = session.tr;
		update_media(tr, [page_id, 'image'], properties);
		expect(tr.created_node_ids).toEqual([]);
		expect(tr.deleted_node_ids).toEqual([]);
		session.apply(tr);
		expect(session.get([page_id, 'image']).id).toBe(image_id);
		expect(session.get([page_id, 'image'])).toMatchObject(properties);
	}
	session.undo();
	expect(session.get([page_id, 'image'])).toMatchObject({
		id: image_id,
		alt: 'Updated alt',
		scale: 1.5
	});
	session.redo();
	expect(session.get([page_id, 'image'])).toMatchObject({ id: image_id, src: 'replacement.webp' });
});

it('creates new nodes for image/video type changes but keeps IDs for video edits and clearing', () => {
	const doc: Document = structuredClone(default_site_document);
	const owner = Object.values(doc.nodes).find((node) => node.type === 'supporting_media')!;
	const session = new Session(document_schema, doc, {});
	const image_id = owner.media;
	let tr = session.tr;
	update_media(tr, [owner.id, 'media'], { type: 'video', src: 'movie.mp4', width: 640 });
	session.apply(tr);
	const video_id = session.get([owner.id, 'media']).id;
	expect(video_id).not.toBe(image_id);
	tr = session.tr;
	update_media(tr, [owner.id, 'media'], { scale: 2, src: 'replacement.mp4' });
	session.apply(tr);
	expect(session.get([owner.id, 'media']).id).toBe(video_id);
	tr = session.tr;
	delete_media(tr, [owner.id, 'media']);
	session.apply(tr);
	expect(session.get([owner.id, 'media'])).toMatchObject({
		id: video_id,
		type: 'video',
		...MEDIA_DEFAULTS
	});
	tr = session.tr;
	update_media(tr, [owner.id, 'media'], { type: 'image', src: 'new.webp' });
	session.apply(tr);
	expect(session.get([owner.id, 'media']).id).not.toBe(video_id);
	session.undo();
	expect(session.get([owner.id, 'media']).id).toBe(video_id);
	session.redo();
	expect(session.get([owner.id, 'media']).type).toBe('image');
});

it('ignores clipboard IDs and creates an independent copied media node even for the same type', () => {
	const doc: Document = structuredClone(default_site_document);
	const id = doc.document_id;
	const image_id = doc.nodes[id].image;
	const session = new Session(document_schema, doc, {});
	const tr = session.tr;
	paste_media(
		tr,
		[id, 'image'],
		clipboard_html({
			kind: 'property',
			type: 'node',
			value: { ...doc.nodes[image_id], id: 'copied_id', src: 'copied.webp' }
		})
	);
	session.apply(tr);
	const next = session.get([id, 'image']);
	expect(next.id).not.toBe(image_id);
	expect(next.id).not.toBe('copied_id');
	expect(next.src).toBe('copied.webp');
});

it('does not record operations for unchanged media properties', () => {
	const { doc, page_id, image_id } = media_document();
	const session = new Session(document_schema, doc, {});
	const tr = session.tr;
	update_media(tr, [page_id, 'image'], { scale: doc.nodes[image_id].scale });
	expect(tr.ops).toEqual([]);
	expect(tr.created_node_ids).toEqual([]);
});
