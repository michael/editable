import { describe, expect, it } from 'vitest';
import { Session, type Document } from 'svedit';
import { default_site_document } from './default_site.js';
import { document_schema, MEDIA_DEFAULTS } from './document_schema.js';
import { delete_media, paste_translated_media, update_media } from './media_translation.js';
import {
	document_structure,
	is_media_property,
	normalized_payload,
	property_payload,
	replace_translation
} from './translations.js';

function shared_media() {
	const doc: Document = structuredClone(default_site_document);
	const page_id = doc.document_id;
	const image_id = doc.nodes[page_id].image;
	const old_logo = doc.nodes.nav_logo.media;
	doc.nodes.nav_logo.media = image_id;
	delete doc.nodes[old_logo];
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

	it('detaches a media edit, preserves shared originals, and supports undo/redo', () => {
		const { doc, page_id, image_id } = shared_media();
		const session = new Session(document_schema, doc, {});
		const tr = session.tr;
		update_media(tr, [page_id, 'image'], { alt: 'Deutscher Alternativtext', scale: 1.5 }, true);
		session.apply(tr);
		const next_id = session.doc.nodes[page_id].image;
		expect(next_id).not.toBe(image_id);
		expect(session.doc.nodes.nav_logo.media).toBe(image_id);
		expect(session.doc.nodes[image_id]).toEqual(doc.nodes[image_id]);
		expect(session.doc.nodes[next_id].alt).toBe('Deutscher Alternativtext');
		expect(document_structure(session.doc)).toBe(document_structure(doc));
		session.undo();
		expect(session.doc.nodes[page_id].image).toBe(image_id);
		expect(session.doc.nodes[next_id]).toBeUndefined();
		session.redo();
		expect(session.doc.nodes[page_id].image).toBe(next_id);
	});

	it('deletes only the selected translated media and can undo the deletion', () => {
		const { doc, page_id, image_id } = shared_media();
		const session = new Session(document_schema, doc, {
			handle_property_deletion: (tr, path) => delete_media(tr, path, true)
		});
		session.apply(
			session.tr.set_selection({ type: 'property', path: [page_id, 'image'] }).delete_selection()
		);
		const cleared = session.get([page_id, 'image']);
		expect(cleared).toMatchObject(MEDIA_DEFAULTS);
		expect(cleared.id).not.toBe(image_id);
		expect(session.get(['nav_logo', 'media'])).toEqual(doc.nodes[image_id]);
		expect(document_structure(session.doc)).toBe(document_structure(doc));
		session.undo();
		expect(session.get([page_id, 'image'])).toEqual(doc.nodes[image_id]);
		session.redo();
		expect(session.get([page_id, 'image'])).toMatchObject(MEDIA_DEFAULTS);
	});

	it('preserves media payload IDs unless occupied and leaves the payload and shared nodes untouched', () => {
		const { doc, page_id, image_id } = shared_media();
		const payload = property_payload(doc, page_id, 'image');
		if (!('node_id' in payload)) throw new Error('Expected media');
		payload.nodes[image_id].alt = 'Translated';
		const snapshot = structuredClone(payload);
		const original = structuredClone(doc.nodes[image_id]);
		replace_translation(doc, page_id, 'image', payload);
		expect(doc.nodes[page_id].image).not.toBe(image_id);
		expect(doc.nodes[image_id]).toEqual(original);
		expect(payload).toEqual(snapshot);
		expect(normalized_payload(property_payload(doc, page_id, 'image'))).toBe(
			normalized_payload(payload)
		);
	});

	it('rejects an incompatible media type and unrelated included nodes', () => {
		const { doc, page_id, image_id } = shared_media();
		const snapshot = structuredClone(doc);
		const payload = {
			node_id: 'translated',
			nodes: { translated: { ...doc.nodes[image_id], id: 'translated', type: 'video' } }
		};
		expect(() => replace_translation(doc, page_id, 'image', payload)).toThrow(
			'Unsupported media type'
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

it('pastes copied media into a translation without changing shared originals and supports undo', () => {
	const { doc, page_id, image_id } = shared_media();
	const session = new Session(document_schema, doc, {});
	const copied = { ...doc.nodes[image_id], src: 'copied.webp', alt: 'Übersetztes Bild' };
	const tr = session.tr;
	expect(
		paste_translated_media(
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
	expect(session.get(['nav_logo', 'media'])).toEqual(doc.nodes[image_id]);
	expect(document_structure(session.doc)).toBe(document_structure(doc));
	session.undo();
	expect(session.get([page_id, 'image'])).toEqual(doc.nodes[image_id]);
});

it('rejects incompatible media, structural clipboard content, and malformed data', () => {
	const { doc, page_id, image_id } = shared_media();
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
		expect(paste_translated_media(session.tr, [page_id, 'image'], html)).toBe(false);
	}
	expect(
		paste_translated_media(
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
