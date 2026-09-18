/**
 * The application's document model: node types, properties, marks, and defaults.
 * Keep content-shape decisions here so the session and components share one schema.
 */
import { define_document_schema, type NodeMap } from 'svedit';

/** Default values for media node properties (image and video). */
export const MEDIA_DEFAULTS = {
	src: '',
	mime_type: '',
	width: 0,
	height: 0,
	alt: '',
	scale: 1.0,
	focal_point_x: 0.5,
	focal_point_y: 0.5,
	object_fit: 'contain'
};

const ALL_MARKS = ['strong', 'emphasis', 'code', 'highlight', 'link'];
const MINIMAL_MARKS = ['emphasis', 'highlight'];
const NO_MARKS = [];
const TEXT_NODE_TYPES = [
	'paragraph_sm',
	'paragraph',
	'paragraph_lg',
	'paragraph_xl',
	'heading_1_xl',
	'heading_1',
	'heading_2',
	'heading_3',
	'heading_4'
];
const RICH_CONTENT_NODE_TYPES = [...TEXT_NODE_TYPES, 'list', 'supporting_media', 'button_group'];
const RICH_CONTENT_NODE_TYPES_WITHOUT_HEADINGS = [
	'paragraph_sm',
	'paragraph',
	'paragraph_lg',
	'paragraph_xl',
	'list',
	'supporting_media',
	'button_group'
];

export const document_schema = define_document_schema({
	page: {
		kind: 'document',
		properties: {
			title: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			},
			description: {
				type: 'text',
				mark_types: [],
				allow_newlines: true
			},
			image: {
				type: 'node',
				node_types: ['image'],
				default_node_type: 'image'
			},
			body: {
				type: 'node_array',
				node_types: [
					'prose',
					'prose_grid',
					'figure',
					'captioned_figure',
					'gallery',
					'feature',
					'titled_gallery',
					'descriptive_gallery',
					'listing',
					'descriptive_listing',
					'accordion',
					'preformatted'
				],
				mark_types: ['section'],
				default_node_type: 'prose'
			},
			nav: {
				type: 'node',
				node_types: ['nav'],
				default_node_type: 'nav'
			},
			footer: {
				type: 'node',
				node_types: ['footer'],
				default_node_type: 'footer'
			}
		}
	},
	footer: {
		kind: 'block',
		properties: {
			body: {
				type: 'node_array',
				node_types: RICH_CONTENT_NODE_TYPES,
				default_node_type: 'paragraph'
			},
			footer_link_columns: {
				type: 'node_array',
				node_types: ['footer_link_column'],
				default_node_type: 'footer_link_column'
			}
		}
	},
	footer_link_column: {
		kind: 'block',
		properties: {
			items: {
				type: 'node_array',
				node_types: ['footer_link_category', 'footer_link'],
				default_node_type: 'footer_link'
			}
		}
	},
	footer_link_category: {
		kind: 'block',
		properties: {
			title: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			}
		}
	},
	footer_link: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			label: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			}
		}
	},
	nav: {
		kind: 'block',
		properties: {
			start_items: {
				type: 'node_array',
				node_types: ['nav_media', 'nav_link', 'nav_button'],
				default_node_type: 'nav_media'
			},
			middle_items: {
				type: 'node_array',
				node_types: ['nav_link', 'nav_button', 'nav_media'],
				default_node_type: 'nav_link'
			},
			end_items: {
				type: 'node_array',
				node_types: ['nav_link', 'nav_button', 'nav_media'],
				default_node_type: 'nav_button'
			}
		}
	},
	nav_link: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			label: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			}
		}
	},
	nav_button: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['primary', 'secondary'], default: 'primary' },
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			label: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			}
		}
	},
	nav_media: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			}
		}
	},

	button: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['primary', 'secondary', 'link', 'primary-small', 'secondary-small', 'link-small'],
				default: 'primary'
			},
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			label: {
				type: 'text',
				mark_types: [],
				allow_newlines: false
			}
		}
	},
	button_group: {
		kind: 'block',
		properties: {
			buttons: {
				type: 'node_array',
				node_types: ['button'],
				default_node_type: 'button'
			}
		}
	},
	prose_grid: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['plain', 'plain-centered-text', 'boxed', 'boxed-centered-text'],
				default: 'plain'
			},
			items: {
				type: 'node_array',
				node_types: ['prose_grid_item'],
				default_node_type: 'prose_grid_item'
			}
		}
	},
	prose_grid_item: {
		kind: 'block',
		properties: {
			body: {
				type: 'node_array',
				node_types: RICH_CONTENT_NODE_TYPES,
				default_node_type: 'paragraph'
			}
		}
	},
	prose: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: [
					'narrow-left',
					'narrow-center',
					'narrow-right',
					'narrow-centered-text',
					'wide-left',
					'wide-centered-text'
				],
				default: 'narrow-left'
			},
			body: {
				type: 'node_array',
				node_types: RICH_CONTENT_NODE_TYPES,
				default_node_type: 'paragraph'
			}
		}
	},
	preformatted: {
		kind: 'block',
		properties: {
			content: {
				type: 'text',
				mark_types: NO_MARKS,
				allow_newlines: true
			}
		}
	},
	paragraph: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	paragraph_sm: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	paragraph_lg: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	paragraph_xl: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},

	heading_1_xl: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	heading_1: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},

	heading_2: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	heading_3: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	heading_4: {
		kind: 'text',
		properties: {
			layout: { type: 'string', values: ['regular', 'muted'], default: 'regular' },
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	list_item: {
		kind: 'text',
		properties: {
			content: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: true
			}
		}
	},
	list: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['square', 'check', 'decimal', 'lower-alpha'],
				default: 'square'
			},
			list_items: {
				type: 'node_array',
				node_types: ['list_item'],
				default_node_type: 'list_item'
			}
		}
	},
	image: {
		kind: 'block',
		properties: {
			src: { type: 'string' },
			mime_type: { type: 'string' },
			width: { type: 'integer' },
			height: { type: 'integer' },
			alt: { type: 'string' },
			focal_point_x: { type: 'number', default: MEDIA_DEFAULTS.focal_point_x },
			focal_point_y: { type: 'number', default: MEDIA_DEFAULTS.focal_point_y },
			scale: { type: 'number', default: MEDIA_DEFAULTS.scale },
			object_fit: { type: 'string', default: MEDIA_DEFAULTS.object_fit }
		}
	},
	video: {
		kind: 'block',
		properties: {
			src: { type: 'string' },
			mime_type: { type: 'string' },
			width: { type: 'integer' },
			height: { type: 'integer' },
			alt: { type: 'string' },
			focal_point_x: { type: 'number', default: MEDIA_DEFAULTS.focal_point_x },
			focal_point_y: { type: 'number', default: MEDIA_DEFAULTS.focal_point_y },
			scale: { type: 'number', default: MEDIA_DEFAULTS.scale },
			object_fit: { type: 'string', default: MEDIA_DEFAULTS.object_fit }
		}
	},
	figure: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['wide', 'narrow-left', 'narrow-center', 'narrow-right', 'flush', 'full-bleed'],
				default: 'wide'
			},
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			}
		}
	},
	captioned_figure: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			},
			caption: {
				type: 'text',
				mark_types: ALL_MARKS,
				allow_newlines: false
			}
		}
	},
	supporting_media: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media_max_width: { type: 'integer', default: 0 },
			media_aspect_ratio: { type: 'number', default: 0 },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			}
		}
	},
	gallery: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: [
					'mixed',
					'portraits',
					'squares-2-columns',
					'squares-3-columns',
					'squares',
					'landscapes',
					'compact-landscapes'
				],
				default: 'mixed'
			},
			gallery_items: {
				type: 'node_array',
				node_types: ['gallery_item']
			}
		}
	},
	gallery_item: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			}
		}
	},
	titled_gallery: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['cards', 'compact', 'carousel'], default: 'cards' },
			items: {
				type: 'node_array',
				node_types: ['titled_gallery_item']
			}
		}
	},
	titled_gallery_item: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			},
			title: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			}
		}
	},
	descriptive_gallery: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['cards', 'compact', 'carousel'], default: 'cards' },
			items: {
				type: 'node_array',
				node_types: ['descriptive_gallery_item']
			}
		}
	},
	descriptive_gallery_item: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			},
			title: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			},
			description: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: true
			}
		}
	},
	listing: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['narrow-left', 'narrow-center', 'narrow-right', 'full-width', 'two-columns'],
				default: 'narrow-left'
			},
			items: {
				type: 'node_array',
				node_types: ['listing_item']
			}
		}
	},
	listing_item: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			title: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			},
			meta: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			}
		}
	},
	descriptive_listing: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['narrow-left', 'narrow-center', 'narrow-right', 'full-width', 'two-columns'],
				default: 'narrow-left'
			},
			items: {
				type: 'node_array',
				node_types: ['descriptive_listing_item']
			}
		}
	},
	descriptive_listing_item: {
		kind: 'block',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			title: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			},
			description: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: true
			},
			meta: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			}
		}
	},
	accordion: {
		kind: 'block',
		properties: {
			layout: {
				type: 'string',
				values: ['narrow-left', 'narrow-center', 'narrow-right', 'full-width', 'two-columns'],
				default: 'narrow-left'
			},
			items: {
				type: 'node_array',
				node_types: ['accordion_item']
			}
		}
	},
	accordion_item: {
		kind: 'block',
		properties: {
			title: {
				type: 'text',
				mark_types: MINIMAL_MARKS,
				allow_newlines: false
			},
			body: {
				type: 'node_array',
				node_types: RICH_CONTENT_NODE_TYPES_WITHOUT_HEADINGS,
				default_node_type: 'paragraph'
			}
		}
	},
	feature: {
		kind: 'block',
		properties: {
			layout: { type: 'string', values: ['image-right', 'image-left'], default: 'image-right' },
			href: { type: 'string' },
			target: { type: 'string', default: '_self' },
			media: {
				type: 'node',
				node_types: ['image', 'video'],
				default_node_type: 'image'
			},
			body: {
				type: 'node_array',
				node_types: RICH_CONTENT_NODE_TYPES,
				default_node_type: 'paragraph'
			}
		}
	},

	link: {
		kind: 'mark',
		properties: {
			href: { type: 'string' },
			target: { type: 'string', default: '_self' }
		}
	},
	strong: {
		kind: 'mark',
		properties: {}
	},
	emphasis: {
		kind: 'mark',
		properties: {}
	},
	code: {
		kind: 'mark',
		properties: {}
	},
	highlight: {
		kind: 'mark',
		properties: {}
	},
	section: {
		kind: 'mark',
		properties: {}
	}
});

/**
 * Map from node type name to its schema-derived runtime shape,
 * e.g. `Nodes['paragraph']` — gives property autocomplete in components.
 */
export type Nodes = NodeMap<typeof document_schema>;
