/**
 * The application's Svedit configuration: components, commands, inserters, and exporters.
 * `session.ts` composes this configuration with the schema and default site document.
 */
import {
	Session,
	define_keymap,
	SelectAllCommand,
	InsertDefaultNodeCommand,
	AddNewLineCommand,
	BreakTextNodeCommand,
	ToggleMarkCommand,
	UndoCommand,
	RedoCommand,
	SelectParentCommand
} from 'svedit';
import type { DocumentNode, DocumentPath, NodeSelection, Text, Transaction } from 'svedit';
import nanoid from './nanoid.js';
import {
	CycleLayoutCommand,
	CycleNodeTypeCommand,
	ToggleLinkCommand,
	RemoveLinkCommand,
	EditLinkCommand,
	ReplaceMediaCommand,
	EditImageCommand,
	ToggleAccordionCommand,
	DuplicateNodesCommand
} from './commands.svelte.js';

import Overlays from './components/Overlays.svelte';
import Page from './components/Page.svelte';
import Nav from './components/Nav.svelte';
import NavLink from './components/NavLink.svelte';
import NavButton from './components/NavButton.svelte';
import NavMedia from './components/NavMedia.svelte';
import Footer from './components/Footer.svelte';
import FooterLinkColumn from './components/FooterLinkColumn.svelte';
import FooterLinkCategory from './components/FooterLinkCategory.svelte';
import FooterLink from './components/FooterLink.svelte';
import Prose from './components/Prose.svelte';
import ProseGrid from './components/ProseGrid.svelte';
import ProseGridItem from './components/ProseGridItem.svelte';
import Preformatted from './components/Preformatted.svelte';
import Paragraph from './components/Paragraph.svelte';
import ParagraphLG from './components/ParagraphLG.svelte';
import ParagraphXL from './components/ParagraphXL.svelte';
import ParagraphSM from './components/ParagraphSM.svelte';
import Heading1XL from './components/Heading1XL.svelte';
import Heading1 from './components/Heading1.svelte';
import Heading2 from './components/Heading2.svelte';
import Heading3 from './components/Heading3.svelte';
import Heading4 from './components/Heading4.svelte';
import List from './components/List.svelte';
import ListItem from './components/ListItem.svelte';
import Gallery from './components/Gallery.svelte';
import GalleryItem from './components/GalleryItem.svelte';
import DescriptiveGallery from './components/DescriptiveGallery.svelte';
import DescriptiveGalleryItem from './components/DescriptiveGalleryItem.svelte';
import TitledGallery from './components/TitledGallery.svelte';
import TitledGalleryItem from './components/TitledGalleryItem.svelte';
import Listing from './components/Listing.svelte';
import ListingItem from './components/ListingItem.svelte';
import DescriptiveListing from './components/DescriptiveListing.svelte';
import DescriptiveListingItem from './components/DescriptiveListingItem.svelte';
import Accordion from './components/Accordion.svelte';
import AccordionItem from './components/AccordionItem.svelte';
import Figure from './components/Figure.svelte';
import CaptionedFigure from './components/CaptionedFigure.svelte';
import SupportingMedia from './components/SupportingMedia.svelte';
import Feature from './components/Feature.svelte';
import Button from './components/Button.svelte';
import ButtonGroup from './components/ButtonGroup.svelte';
import Image from './components/Image.svelte';
import Video from './components/Video.svelte';
import Strong from './components/Strong.svelte';
import Emphasis from './components/Emphasis.svelte';
import Code from './components/Code.svelte';
import Highlight from './components/Highlight.svelte';
import Link from './components/Link.svelte';
import Section from './components/Section.svelte';

import { document_schema, MEDIA_DEFAULTS } from '#app/document_schema.js';
import { start_processing } from '#app/asset_upload.js';
import { set_properties } from 'svedit';
import { get_media_dimensions } from '#lib/client/media_dimensions.js';

type AppSession = Session<typeof document_schema>;

function get_media_type(file: File): 'image' | 'video' {
	if (file.type.startsWith('video/')) return 'video';
	return 'image';
}

function select_inserted_text_property(
	tr: Transaction,
	property_name = 'label',
	child_path: DocumentPath = []
) {
	// Right after an insert the selection is a node selection over the new node.
	const selection = tr.selection as NodeSelection;
	tr.set_selection({
		type: 'text',
		path: [...selection.path, selection.focus_offset - 1, ...child_path, property_name],
		anchor_offset: 0,
		focus_offset: 0
	});
}

function insert_text_node(
	tr: Transaction,
	node_type: string,
	content: Text = { content: '', marks: [], annotations: [] },
	layout = 'regular'
) {
	const new_text = {
		id: nanoid(),
		type: node_type,
		layout,
		content
	};
	tr.create(new_text);
	tr.insert_nodes([new_text.id]);
	// Right after an insert the selection is a node selection over the new node.
	const selection = tr.selection as NodeSelection;
	tr.set_selection({
		type: 'text',
		path: [...selection.path, selection.focus_offset - 1, 'content'],
		anchor_offset: 0,
		focus_offset: 0
	});
}

/**
 * Replace a media node at the given path with a new file.
 * Reused by handle_media_paste and the toolbar's replace-image button.
 * blob_url is a blob: or data: URL for immediate display.
 */
async function replace_media(
	session: AppSession,
	path: DocumentPath,
	file: File,
	blob_url: string
) {
	if (session.config.allow_structural_changes === false) return;
	const node = session.get(path);
	if (node.type !== 'image' && node.type !== 'video') return;

	const media_type = get_media_type(file);
	const dims = await get_media_dimensions(file);

	// HACK: Make sure we have a proper before selection
	// Needed because of the focus steal in Toolbar.
	session.selection = { type: 'property', path };
	const tr = session.tr;

	if (media_type === node.type) {
		// Same type — replace src and dimensions, reset crop
		set_properties(tr, path, {
			...MEDIA_DEFAULTS,
			src: blob_url,
			mime_type: file.type,
			width: dims.width,
			height: dims.height
		});
	} else {
		// Different type — replace the entire node
		const new_node = {
			...MEDIA_DEFAULTS,
			id: nanoid(),
			type: media_type,
			src: blob_url,
			mime_type: file.type,
			width: dims.width,
			height: dims.height
		};
		tr.create(new_node);
		const parent_path = path.slice(0, -1);
		const property_name = path[path.length - 1];
		tr.set([...parent_path, property_name], new_node.id);
	}

	// Set selection on the transaction so undo/redo restores it correctly
	tr.selection = { type: 'property', path };
	session.apply(tr);
	start_processing(blob_url, file);
}

// App-specific config object, always available via session.config for introspection
export const document_config = {
	// Custom ID generator function
	generate_id: nanoid,
	// Provide definitions/overrides for system native components,
	// such as node_gap, node_gap_markers, node_selection_markers, or overlays
	system_components: {
		overlays: Overlays
	},
	// Registry of components for each node type
	node_components: {
		page: Page,
		nav: Nav,
		nav_link: NavLink,
		nav_button: NavButton,
		nav_media: NavMedia,
		footer: Footer,
		footer_link_column: FooterLinkColumn,
		footer_link_category: FooterLinkCategory,
		footer_link: FooterLink,
		button: Button,
		button_group: ButtonGroup,
		prose: Prose,
		prose_grid: ProseGrid,
		prose_grid_item: ProseGridItem,
		preformatted: Preformatted,
		paragraph: Paragraph,
		paragraph_lg: ParagraphLG,
		paragraph_xl: ParagraphXL,
		paragraph_sm: ParagraphSM,
		heading_1_xl: Heading1XL,
		heading_1: Heading1,
		heading_2: Heading2,
		heading_3: Heading3,
		heading_4: Heading4,
		list: List,
		list_item: ListItem,
		image: Image,
		video: Video,
		figure: Figure,
		captioned_figure: CaptionedFigure,
		supporting_media: SupportingMedia,
		feature: Feature,
		gallery: Gallery,
		gallery_item: GalleryItem,
		titled_gallery: TitledGallery,
		titled_gallery_item: TitledGalleryItem,
		descriptive_gallery: DescriptiveGallery,
		descriptive_gallery_item: DescriptiveGalleryItem,
		listing: Listing,
		listing_item: ListingItem,
		descriptive_listing: DescriptiveListing,
		descriptive_listing_item: DescriptiveListingItem,
		accordion: Accordion,
		accordion_item: AccordionItem,
		strong: Strong,
		emphasis: Emphasis,
		code: Code,
		highlight: Highlight,
		link: Link,
		section: Section
	},
	replace_media,
	handle_property_deletion: (tr, path) => {
		const property_definition = tr.inspect(path);
		if (property_definition?.type !== 'node') return;

		const target_node = tr.get(path);
		if (target_node?.type !== 'image' && target_node?.type !== 'video') return;

		set_properties(tr, [target_node.id], MEDIA_DEFAULTS);
	},
	handle_media_paste: async (session, pasted_media) => {
		if (session.config.allow_structural_changes === false) return;
		if (session.selection.type === 'property') {
			const node = session.get(session.selection.path);
			if (node.type === 'image' || node.type === 'video') {
				await replace_media(
					session,
					session.selection.path,
					pasted_media[0].blob,
					pasted_media[0].data_url
				);
			}
			return null;
		} else {
			const pasted_json: { main_nodes: string[]; nodes: Record<string, DocumentNode> } = {
				main_nodes: [],
				nodes: {}
			};

			// When cursor inside an image grid we want to insert a gallery_item,
			// otherwise insert a figure.
			let target_node_type;
			if (session.can_insert('gallery_item')) {
				target_node_type = 'gallery_item';
			} else {
				target_node_type = 'figure';
			}
			for (let i = 0; i < pasted_media.length; i++) {
				const pasted_item = pasted_media[i];
				const blob_url = pasted_item.data_url;
				const media_type = get_media_type(pasted_item.blob);

				const dims = await get_media_dimensions(pasted_item.blob);
				const width = dims.width;
				const height = dims.height;

				pasted_json.nodes['node_media_' + i] = {
					...MEDIA_DEFAULTS,
					id: 'node_media_' + i,
					type: media_type,
					src: blob_url,
					mime_type: pasted_item.blob.type,
					width,
					height,
					alt: ''
				};
				pasted_json.nodes['node_' + i] = {
					id: 'node_' + i,
					type: target_node_type,
					media: 'node_media_' + i
				};
				pasted_json.main_nodes.push('node_' + i);

				// Start background processing (hash + resize/encode)
				start_processing(blob_url, pasted_item.blob);
			}
			return pasted_json;
		}
	},

	// HTML exporters for different node types
	html_exporters: {
		prose: (node, session, html_exporters) => {
			let html = '<div class="prose">\n';
			for (const child_id of node.body.nodes) {
				const child = session.get(child_id);
				const exporter = html_exporters[child.type];
				if (exporter) {
					html += exporter(child, session, html_exporters);
				}
			}
			html += '</div>\n';
			return html;
		},
		paragraph: (node) => `<p>${node.content.content}</p>\n`,
		paragraph_sm: (node) => `<p>${node.content.content}</p>\n`,
		paragraph_lg: (node) => `<p>${node.content.content}</p>\n`,
		paragraph_xl: (node) => `<p>${node.content.content}</p>\n`,
		heading_1_xl: (node) => `<h1>${node.content.content}</h1>\n`,
		heading_1: (node) => `<h1>${node.content.content}</h1>\n`,
		heading_2: (node) => `<h2>${node.content.content}</h2>\n`,
		heading_3: (node) => `<h3>${node.content.content}</h3>\n`,
		heading_4: (node) => `<h4>${node.content.content}</h4>\n`,
		preformatted: (node) => `<pre>${node.content.content}</pre>\n`,
		list: (node, session, html_exporters) => {
			let html = '<ul>\n';
			for (const list_item_id of node.list_items.nodes) {
				html += html_exporters.list_item(session.get(list_item_id));
			}
			return `${html}</ul>\n`;
		},
		list_item: (node) => `<li>${node.content.content}</li>\n`
	},

	/**
	 * Factory function to create Svedit commands and keymap.
	 * Called by Svedit component with the svedit context.
	 */
	create_commands_and_keymap: (context) => {
		// Structural commands share a capability without knowing why it is disabled.
		const structural_context = {
			get session() {
				return context.session;
			},
			get editable() {
				return context.editable && context.session.config.allow_structural_changes !== false;
			}
		};
		// Create command instances with the provided context
		const commands = {
			select_all: new SelectAllCommand(context),
			insert_default_node: new InsertDefaultNodeCommand(structural_context),
			add_new_line: new AddNewLineCommand(context),
			break_text_node: new BreakTextNodeCommand(structural_context),
			toggle_strong: new ToggleMarkCommand('strong', context),
			toggle_emphasis: new ToggleMarkCommand('emphasis', context),
			toggle_code: new ToggleMarkCommand('code', context),
			toggle_highlight: new ToggleMarkCommand('highlight', context),
			toggle_section: new ToggleMarkCommand('section', structural_context),
			undo: new UndoCommand(context),
			redo: new RedoCommand(context),
			select_parent: new SelectParentCommand(context),
			cycle_layout_next: new CycleLayoutCommand('next', structural_context),
			cycle_layout_previous: new CycleLayoutCommand('previous', structural_context),
			cycle_node_type_next: new CycleNodeTypeCommand('next', structural_context),
			cycle_node_type_previous: new CycleNodeTypeCommand('previous', structural_context),
			toggle_accordion: new ToggleAccordionCommand(context),
			toggle_link: new ToggleLinkCommand(context),
			remove_link: new RemoveLinkCommand(context),
			edit_link: new EditLinkCommand(context),
			edit_image: new EditImageCommand(structural_context),
			replace_media: new ReplaceMediaCommand(structural_context),
			duplicate_nodes: new DuplicateNodesCommand(structural_context)
		};

		// Define keymap binding keys to commands
		const keymap = define_keymap({
			'meta+a,ctrl+a': [commands.select_all],
			enter: [
				commands.replace_media,
				commands.break_text_node,
				commands.add_new_line,
				commands.insert_default_node
			],
			// In case of a node cursor, fall back to inserting a default node. This is needed
			// because on iOS selecting a node cursor triggers auto capitalization (shift pressed)
			'shift+enter': [commands.replace_media, commands.add_new_line, commands.insert_default_node],
			'alt+enter': [commands.edit_image],
			'meta+b,ctrl+b': [commands.toggle_strong],
			'meta+i,ctrl+i': [commands.toggle_emphasis],
			'meta+shift+c,ctrl+shift+c': [commands.toggle_code],
			'meta+u,ctrl+u': [commands.toggle_highlight],
			'meta+shift+s,ctrl+shift+s': [commands.toggle_section],
			'meta+d,ctrl+d': [commands.duplicate_nodes],
			'meta+z,ctrl+z': [commands.undo],
			'meta+shift+z,ctrl+shift+z': [commands.redo],
			escape: [commands.select_parent],
			'ctrl+shift+arrowright': [commands.cycle_layout_next],
			'ctrl+shift+arrowleft': [commands.cycle_layout_previous],
			'ctrl+shift+arrowdown': [commands.cycle_node_type_next],
			'ctrl+shift+arrowup': [commands.cycle_node_type_previous],
			tab: [commands.toggle_accordion],

			'meta+k,ctrl+k': [commands.edit_link, commands.toggle_link],
			'meta+backspace,ctrl+backspace': [commands.remove_link]
		});

		return { commands, keymap };
	},

	// Custom functions to insert new "blank" nodes and setting the selection depening on the
	// intended behavior.
	inserters: {
		prose: function (tr) {
			const new_heading = {
				id: nanoid(),
				type: 'heading_2',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(new_heading);
			const new_paragraph = {
				id: nanoid(),
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(new_paragraph);
			const new_prose = {
				id: nanoid(),
				type: 'prose',
				layout: 'narrow-left',
				body: { nodes: [new_heading.id, new_paragraph.id], marks: [], annotations: [] }
			};
			tr.create(new_prose);
			tr.insert_nodes([new_prose.id]);
		},
		prose_grid_item: function (tr) {
			const new_heading = {
				id: nanoid(),
				type: 'heading_2',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(new_heading);
			const new_paragraph = {
				id: nanoid(),
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(new_paragraph);
			const new_prose_grid_item = {
				id: nanoid(),
				type: 'prose_grid_item',
				body: { nodes: [new_heading.id, new_paragraph.id], marks: [], annotations: [] }
			};
			tr.create(new_prose_grid_item);
			tr.insert_nodes([new_prose_grid_item.id]);
		},
		prose_grid: function (tr) {
			const new_prose_grid_id = tr.build('new_prose_grid', {
				title_1: {
					id: 'title_1',
					type: 'heading_2',
					content: { content: '', marks: [], annotations: [] }
				},
				title_2: {
					id: 'title_2',
					type: 'heading_2',
					content: { content: '', marks: [], annotations: [] }
				},
				title_3: {
					id: 'title_3',
					type: 'heading_2',
					content: { content: '', marks: [], annotations: [] }
				},
				paragraph_1: {
					id: 'paragraph_1',
					type: 'paragraph',
					content: { content: '', marks: [], annotations: [] }
				},
				paragraph_2: {
					id: 'paragraph_2',
					type: 'paragraph',
					content: { content: '', marks: [], annotations: [] }
				},
				paragraph_3: {
					id: 'paragraph_3',
					type: 'paragraph',
					content: { content: '', marks: [], annotations: [] }
				},
				prose_grid_item_1: {
					id: 'prose_grid_item_1',
					type: 'prose_grid_item',
					body: { nodes: ['title_1', 'paragraph_1'], marks: [], annotations: [] }
				},
				prose_grid_item_2: {
					id: 'prose_grid_item_2',
					type: 'prose_grid_item',
					body: { nodes: ['title_2', 'paragraph_2'], marks: [], annotations: [] }
				},
				prose_grid_item_3: {
					id: 'prose_grid_item_3',
					type: 'prose_grid_item',
					body: { nodes: ['title_3', 'paragraph_3'], marks: [], annotations: [] }
				},
				new_prose_grid: {
					id: 'new_prose_grid',
					type: 'prose_grid',
					layout: 'plain',
					items: {
						nodes: ['prose_grid_item_1', 'prose_grid_item_2', 'prose_grid_item_3'],
						marks: [],
						annotations: []
					}
				}
			});
			tr.insert_nodes([new_prose_grid_id]);
		},
		paragraph: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'paragraph', content, 'regular');
		},
		paragraph_sm: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'paragraph_sm', content, 'regular');
		},
		paragraph_lg: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'paragraph_lg', content, 'regular');
		},
		paragraph_xl: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'paragraph_xl', content, 'regular');
		},
		heading_1_xl: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'heading_1_xl', content, 'regular');
		},
		heading_1: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'heading_1', content, 'regular');
		},
		heading_2: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'heading_2', content, 'regular');
		},
		heading_3: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'heading_3', content, 'regular');
		},
		heading_4: function (tr, content = { content: '', marks: [], annotations: [] }) {
			insert_text_node(tr, 'heading_4', content, 'regular');
		},
		preformatted: function (tr, content = { content: '', marks: [], annotations: [] }) {
			const new_preformatted = {
				id: nanoid(),
				type: 'preformatted',
				content: { ...content, marks: [], annotations: [] }
			};
			tr.create(new_preformatted);
			tr.insert_nodes([new_preformatted.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		list: function (tr) {
			const new_list_item = {
				id: nanoid(),
				type: 'list_item',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(new_list_item);

			const new_list = {
				id: nanoid(),
				type: 'list',
				layout: 'square',
				list_items: { nodes: [new_list_item.id], marks: [], annotations: [] }
			};
			tr.create(new_list);
			tr.insert_nodes([new_list.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'list_items', 0, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		list_item: function (tr, content = { content: '', marks: [], annotations: [] }) {
			const new_list_item = {
				id: nanoid(),
				type: 'list_item',
				content
			};
			tr.create(new_list_item);
			tr.insert_nodes([new_list_item.id]);
			tr.set_selection({
				type: 'text',
				path: [...tr.selection.path, tr.selection.focus_offset - 1, 'content'],
				anchor_offset: 0,
				focus_offset: 0
			});
		},
		feature: function (tr) {
			const new_feature_id = tr.build('new_feature', {
				feature_image: {
					id: 'feature_image',
					type: 'image',
					...MEDIA_DEFAULTS
				},
				body_text: {
					id: 'body_text',
					type: 'heading_2',
					content: { content: '', marks: [], annotations: [] }
				},
				new_feature: {
					id: 'new_feature',
					type: 'feature',
					layout: 'image-right',
					href: '',
					target: '_self',
					media: 'feature_image',
					body: { nodes: ['body_text'], marks: [], annotations: [] }
				}
			});

			tr.insert_nodes([new_feature_id]);
		},
		figure: function (tr, _content = { content: '', marks: [], annotations: [] }, layout = 'wide') {
			const new_figure_id = tr.build('new_figure', {
				image_one: {
					id: 'image_one',
					type: 'image',
					...MEDIA_DEFAULTS
				},
				new_figure: {
					id: 'new_figure',
					type: 'figure',
					layout,
					href: '',
					target: '_self',
					media: 'image_one'
				}
			});

			tr.insert_nodes([new_figure_id]);
		},
		captioned_figure: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_captioned_figure_id = tr.build('new_captioned_figure', {
				image_one: {
					id: 'image_one',
					type: 'image',
					...MEDIA_DEFAULTS
				},
				new_captioned_figure: {
					id: 'new_captioned_figure',
					type: 'captioned_figure',
					href: '',
					target: '_self',
					media: 'image_one',
					caption: { content: '', marks: [], annotations: [] }
				}
			});

			tr.insert_nodes([new_captioned_figure_id]);
		},
		supporting_media: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_supporting_media_id = tr.build('new_supporting_media', {
				image_one: {
					id: 'image_one',
					type: 'image',
					...MEDIA_DEFAULTS
				},
				new_supporting_media: {
					id: 'new_supporting_media',
					type: 'supporting_media',
					href: '',
					target: '_self',
					media: 'image_one'
				}
			});

			tr.insert_nodes([new_supporting_media_id]);
		},
		nav_link: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_nav_link_id = tr.build('new_nav_link', {
				new_nav_link: {
					id: 'new_nav_link',
					type: 'nav_link'
				}
			});

			tr.insert_nodes([new_nav_link_id]);
			select_inserted_text_property(tr);
		},
		nav_button: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			layout = 'primary'
		) {
			const new_nav_button_id = tr.build('new_nav_button', {
				new_nav_button: {
					id: 'new_nav_button',
					type: 'nav_button',
					layout
				}
			});

			tr.insert_nodes([new_nav_button_id]);
			select_inserted_text_property(tr);
		},
		nav_media: function (tr) {
			const new_nav_media_id = tr.build('new_nav_media', {
				nav_media_media: {
					id: 'nav_media_media',
					type: 'image',
					...MEDIA_DEFAULTS
				},
				new_nav_media: {
					id: 'new_nav_media',
					type: 'nav_media',
					href: '',
					target: '_self',
					media: 'nav_media_media'
				}
			});

			tr.insert_nodes([new_nav_media_id]);
		},

		button: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			layout = 'primary'
		) {
			const new_button_id = tr.build('new_button', {
				new_button: {
					id: 'new_button',
					type: 'button',
					layout
				}
			});

			tr.insert_nodes([new_button_id]);
			select_inserted_text_property(tr);
		},
		button_group: function (tr) {
			const new_button_group_id = tr.build('new_button_group', {
				primary_button: {
					id: 'primary_button',
					type: 'button',
					layout: 'primary',
					href: '',
					target: '_self',
					label: { content: '', marks: [], annotations: [] }
				},
				secondary_button: {
					id: 'secondary_button',
					type: 'button',
					layout: 'secondary',
					href: '',
					target: '_self',
					label: { content: '', marks: [], annotations: [] }
				},
				new_button_group: {
					id: 'new_button_group',
					type: 'button_group',
					buttons: { nodes: ['primary_button', 'secondary_button'], marks: [], annotations: [] }
				}
			});

			tr.insert_nodes([new_button_group_id]);
		},
		footer_link: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_footer_link_id = tr.build('new_footer_link', {
				new_footer_link: {
					id: 'new_footer_link',
					type: 'footer_link'
				}
			});

			tr.insert_nodes([new_footer_link_id]);
			select_inserted_text_property(tr);
		},
		footer_link_category: function (
			tr,
			content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_footer_link_category_id = tr.build('new_footer_link_category', {
				new_footer_link_category: {
					id: 'new_footer_link_category',
					type: 'footer_link_category',
					title: content
				}
			});

			tr.insert_nodes([new_footer_link_category_id]);
			select_inserted_text_property(tr, 'title');
		},
		footer_link_column: function (
			tr,
			_content = { content: '', marks: [], annotations: [] },
			_layout = 'default'
		) {
			const new_footer_link_column_id = tr.build('new_footer_link_column', {
				new_footer_link_category: {
					id: 'new_footer_link_category',
					type: 'footer_link_category',
					title: { content: '', marks: [], annotations: [] }
				},
				new_footer_link_1: {
					id: 'new_footer_link_1',
					type: 'footer_link'
				},
				new_footer_link_2: {
					id: 'new_footer_link_2',
					type: 'footer_link'
				},
				new_footer_link_3: {
					id: 'new_footer_link_3',
					type: 'footer_link'
				},
				new_footer_link_column: {
					id: 'new_footer_link_column',
					type: 'footer_link_column',
					items: {
						nodes: [
							'new_footer_link_category',
							'new_footer_link_1',
							'new_footer_link_2',
							'new_footer_link_3'
						],
						marks: [],
						annotations: []
					}
				}
			});

			tr.insert_nodes([new_footer_link_column_id]);
		},

		gallery: function (tr) {
			const gallery_items = [];
			for (let i = 0; i < 6; i++) {
				const gallery_item_image = {
					id: nanoid(),
					type: 'image',
					...MEDIA_DEFAULTS
				};
				tr.create(gallery_item_image);
				const gallery_item = {
					id: nanoid(),
					type: 'gallery_item',
					href: '',
					target: '_self',
					media: gallery_item_image.id
				};
				tr.create(gallery_item);
				gallery_items.push(gallery_item.id);
			}

			const gallery = {
				id: nanoid(),
				type: 'gallery',
				layout: 'mixed',
				gallery_items: { nodes: gallery_items, marks: [], annotations: [] }
			};
			tr.create(gallery);
			tr.insert_nodes([gallery.id]);
		},
		gallery_item: function (tr) {
			const gallery_item_image = {
				id: nanoid(),
				type: 'image',
				src: '',
				width: 800,
				height: 600,
				alt: 'Sample image',
				...MEDIA_DEFAULTS
			};
			tr.create(gallery_item_image);
			const new_gallery_item = {
				id: nanoid(),
				type: 'gallery_item',
				href: '',
				target: '_self',
				media: gallery_item_image.id
			};
			tr.create(new_gallery_item);
			tr.insert_nodes([new_gallery_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		},

		titled_gallery: function (tr) {
			const items = [];
			for (let i = 0; i < 3; i++) {
				const image_id = nanoid();
				const image = {
					id: image_id,
					type: 'image',
					...MEDIA_DEFAULTS
				};
				tr.create(image);
				const titled_gallery_item = {
					id: nanoid(),
					type: 'titled_gallery_item',
					href: '',
					target: '_self',
					media: image_id,
					title: { content: '', marks: [], annotations: [] }
				};
				tr.create(titled_gallery_item);
				items.push(titled_gallery_item.id);
			}

			const titled_gallery = {
				id: nanoid(),
				type: 'titled_gallery',
				layout: 'cards',
				items: { nodes: items, marks: [], annotations: [] }
			};
			tr.create(titled_gallery);
			tr.insert_nodes([titled_gallery.id]);
		},

		titled_gallery_item: function (tr) {
			const image_id = nanoid();
			const image = {
				id: image_id,
				type: 'image',
				...MEDIA_DEFAULTS
			};
			tr.create(image);
			const titled_gallery_item = {
				id: nanoid(),
				type: 'titled_gallery_item',
				href: '',
				target: '_self',
				media: image_id,
				title: { content: '', marks: [], annotations: [] }
			};
			tr.create(titled_gallery_item);
			tr.insert_nodes([titled_gallery_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		},

		descriptive_gallery: function (tr) {
			const items = [];
			for (let i = 0; i < 3; i++) {
				const image_id = nanoid();
				const image = {
					id: image_id,
					type: 'image',
					...MEDIA_DEFAULTS
				};
				tr.create(image);
				const descriptive_gallery_item = {
					id: nanoid(),
					type: 'descriptive_gallery_item',
					href: '',
					target: '_self',
					media: image_id,
					title: { content: '', marks: [], annotations: [] },
					description: { content: '', marks: [], annotations: [] }
				};
				tr.create(descriptive_gallery_item);
				items.push(descriptive_gallery_item.id);
			}

			const descriptive_gallery = {
				id: nanoid(),
				type: 'descriptive_gallery',
				layout: 'cards',
				items: { nodes: items, marks: [], annotations: [] }
			};
			tr.create(descriptive_gallery);
			tr.insert_nodes([descriptive_gallery.id]);
		},

		descriptive_gallery_item: function (tr) {
			const image_id = nanoid();
			const image = {
				id: image_id,
				type: 'image',
				...MEDIA_DEFAULTS
			};
			tr.create(image);
			const descriptive_gallery_item = {
				id: nanoid(),
				type: 'descriptive_gallery_item',
				href: '',
				target: '_self',
				media: image_id,
				title: { content: '', marks: [], annotations: [] },
				description: { content: '', marks: [], annotations: [] }
			};
			tr.create(descriptive_gallery_item);
			tr.insert_nodes([descriptive_gallery_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		},

		listing: function (tr) {
			const items = [];
			for (let i = 0; i < 4; i++) {
				const listing_item = {
					id: nanoid(),
					type: 'listing_item',
					href: '',
					target: '_self',
					title: { content: '', marks: [], annotations: [] },
					meta: { content: '', marks: [], annotations: [] }
				};
				tr.create(listing_item);
				items.push(listing_item.id);
			}

			const listing = {
				id: nanoid(),
				type: 'listing',
				layout: 'narrow-left',
				items: { nodes: items, marks: [], annotations: [] }
			};
			tr.create(listing);
			tr.insert_nodes([listing.id]);
		},

		listing_item: function (tr) {
			const listing_item = {
				id: nanoid(),
				type: 'listing_item',
				href: '',
				target: '_self',
				title: { content: '', marks: [], annotations: [] },
				meta: { content: '', marks: [], annotations: [] }
			};
			tr.create(listing_item);
			tr.insert_nodes([listing_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		},

		descriptive_listing: function (tr) {
			const items = [];
			for (let i = 0; i < 4; i++) {
				const descriptive_listing_item = {
					id: nanoid(),
					type: 'descriptive_listing_item',
					href: '',
					target: '_self',
					title: { content: '', marks: [], annotations: [] },
					description: { content: '', marks: [], annotations: [] },
					meta: { content: '', marks: [], annotations: [] }
				};
				tr.create(descriptive_listing_item);
				items.push(descriptive_listing_item.id);
			}

			const descriptive_listing = {
				id: nanoid(),
				type: 'descriptive_listing',
				layout: 'narrow-left',
				items: { nodes: items, marks: [], annotations: [] }
			};
			tr.create(descriptive_listing);
			tr.insert_nodes([descriptive_listing.id]);
		},

		descriptive_listing_item: function (tr) {
			const descriptive_listing_item = {
				id: nanoid(),
				type: 'descriptive_listing_item',
				href: '',
				target: '_self',
				title: { content: '', marks: [], annotations: [] },
				description: { content: '', marks: [], annotations: [] },
				meta: { content: '', marks: [], annotations: [] }
			};
			tr.create(descriptive_listing_item);
			tr.insert_nodes([descriptive_listing_item.id]);
			tr.set_selection({
				type: 'node',
				path: [...tr.selection.path],
				anchor_offset: tr.selection.focus_offset,
				focus_offset: tr.selection.focus_offset
			});
		},

		accordion: function (tr) {
			const body_text = {
				id: nanoid(),
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(body_text);

			const accordion_item = {
				id: nanoid(),
				type: 'accordion_item',
				title: { content: '', marks: [], annotations: [] },
				body: { nodes: [body_text.id], marks: [], annotations: [] }
			};
			tr.create(accordion_item);

			const accordion = {
				id: nanoid(),
				type: 'accordion',
				layout: 'narrow-left',
				items: { nodes: [accordion_item.id], marks: [], annotations: [] }
			};
			tr.create(accordion);
			tr.insert_nodes([accordion.id]);
		},

		accordion_item: function (tr) {
			const body_text = {
				id: nanoid(),
				type: 'paragraph',
				content: { content: '', marks: [], annotations: [] }
			};
			tr.create(body_text);

			const accordion_item = {
				id: nanoid(),
				type: 'accordion_item',
				title: { content: '', marks: [], annotations: [] },
				body: { nodes: [body_text.id], marks: [], annotations: [] }
			};
			tr.create(accordion_item);
			tr.insert_nodes([accordion_item.id]);
			select_inserted_text_property(tr, 'title');
		}
	}
};
