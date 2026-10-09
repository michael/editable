// Default content for a new site.
// Stored as a single merged document so you can paste console.logged JSON directly.
// The default nav, footer, and page documents are extracted automatically using svedit's traverse utility.

import { fill_document_defaults, traverse } from 'svedit';
import { document_schema } from '#app/document_schema.js';
import nanoid from '#app/nanoid.js';

const home_page_id = nanoid();

const FULL_DOC = {
	document_id: 'rsbYSFDDKECGfkngAZEWGmF',
	nodes: {
		uqHVWPtxuErWwxjaCgJMwZs: {
			id: 'uqHVWPtxuErWwxjaCgJMwZs',
			type: 'image',
			src: '',
			mime_type: '',
			width: 0,
			height: 0,
			alt: '',
			scale: 1,
			focal_point_x: 0.5,
			focal_point_y: 0.5,
			object_fit: 'contain'
		},
		nav_logo_media: {
			id: 'nav_logo_media',
			type: 'image',
			src: '',
			mime_type: '',
			width: 0,
			height: 0,
			alt: '',
			scale: 1,
			focal_point_x: 0.5,
			focal_point_y: 0.5,
			object_fit: 'contain'
		},
		nav_logo: {
			id: 'nav_logo',
			type: 'nav_media',
			href: '/',
			target: '_self',
			media: 'nav_logo_media'
		},
		xSzNHmxTKATmuUfzNjjRWVh: {
			id: 'xSzNHmxTKATmuUfzNjjRWVh',
			type: 'nav_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		DDmmrQzcAxWJfdhatTbkRTh: {
			id: 'DDmmrQzcAxWJfdhatTbkRTh',
			type: 'nav_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		BESRZnRsUbbWapdUTzGNxFH: {
			id: 'BESRZnRsUbbWapdUTzGNxFH',
			type: 'nav_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		atmQQGpCXBweGkkcSuKpJPS: {
			id: 'atmQQGpCXBweGkkcSuKpJPS',
			type: 'nav_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		yeYXsdtjqkFgJtvdhjTemtP: {
			id: 'yeYXsdtjqkFgJtvdhjTemtP',
			type: 'nav_button',
			layout: 'primary',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		FKgjxHCeSbVZrdnPuxYkMYp: {
			id: 'FKgjxHCeSbVZrdnPuxYkMYp',
			type: 'nav_button',
			layout: 'secondary',
			href: '',
			target: '_blank',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		nav_1: {
			id: 'nav_1',
			type: 'nav',
			start_items: {
				nodes: ['nav_logo'],
				marks: [],
				annotations: []
			},
			middle_items: {
				nodes: [
					'xSzNHmxTKATmuUfzNjjRWVh',
					'DDmmrQzcAxWJfdhatTbkRTh',
					'BESRZnRsUbbWapdUTzGNxFH',
					'atmQQGpCXBweGkkcSuKpJPS'
				],
				marks: [],
				annotations: []
			},
			end_items: {
				nodes: ['yeYXsdtjqkFgJtvdhjTemtP', 'FKgjxHCeSbVZrdnPuxYkMYp'],
				marks: [],
				annotations: []
			}
		},
		ncqBPBKuDzbdCKqPdAUwszK: {
			id: 'ncqBPBKuDzbdCKqPdAUwszK',
			type: 'image',
			src: '',
			mime_type: '',
			width: 0,
			height: 0,
			alt: '',
			scale: 1,
			focal_point_x: 0.5,
			focal_point_y: 0.5,
			object_fit: 'contain'
		},
		WkrTBHKFKjjCphujhzqZrup: {
			id: 'WkrTBHKFKjjCphujhzqZrup',
			type: 'supporting_media',
			media: 'ncqBPBKuDzbdCKqPdAUwszK',
			media_max_width: 128,
			media_aspect_ratio: 1.7777777777777777,
			href: '/',
			target: '_self'
		},
		fWFgvucsMbVzrEDZSSXxhWA: {
			id: 'fWFgvucsMbVzrEDZSSXxhWA',
			type: 'paragraph_sm',
			layout: 'regular',
			content: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		footer_link_category_1: {
			id: 'footer_link_category_1',
			type: 'footer_link_category',
			title: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		KHTAxQcgeFDzUgxvcpHURuy: {
			id: 'KHTAxQcgeFDzUgxvcpHURuy',
			type: 'footer_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		EtcfbabRCtPSvSpfFfjPeza: {
			id: 'EtcfbabRCtPSvSpfFfjPeza',
			type: 'footer_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		fcSSWQUTYajjknPChgGsPZz: {
			id: 'fcSSWQUTYajjknPChgGsPZz',
			type: 'footer_link_column',
			items: {
				nodes: ['footer_link_category_1', 'KHTAxQcgeFDzUgxvcpHURuy', 'EtcfbabRCtPSvSpfFfjPeza'],
				marks: [],
				annotations: []
			}
		},
		footer_link_category_2: {
			id: 'footer_link_category_2',
			type: 'footer_link_category',
			title: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		krgAPmEvphScfYJUMmeyQvT: {
			id: 'krgAPmEvphScfYJUMmeyQvT',
			type: 'footer_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		uavzfSnSpTRrHSfJpbfvpsh: {
			id: 'uavzfSnSpTRrHSfJpbfvpsh',
			type: 'footer_link',
			href: '',
			target: '_blank',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		footer_column_2: {
			id: 'footer_column_2',
			type: 'footer_link_column',
			items: {
				nodes: ['footer_link_category_2', 'krgAPmEvphScfYJUMmeyQvT', 'uavzfSnSpTRrHSfJpbfvpsh'],
				marks: [],
				annotations: []
			}
		},
		XJPhwEKTDnDGzPEnAjpjqYe: {
			id: 'XJPhwEKTDnDGzPEnAjpjqYe',
			type: 'footer_link_category',
			title: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		XwSHBshPgtBVkfKwwZpmGXz: {
			id: 'XwSHBshPgtBVkfKwwZpmGXz',
			type: 'footer_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		DCjbSqkDXcnzARnaVVfZgvD: {
			id: 'DCjbSqkDXcnzARnaVVfZgvD',
			type: 'footer_link',
			href: '',
			target: '_self',
			label: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		VTRuBHweKUkfXmNUYcmTaHp: {
			id: 'VTRuBHweKUkfXmNUYcmTaHp',
			type: 'footer_link_column',
			items: {
				nodes: ['XJPhwEKTDnDGzPEnAjpjqYe', 'XwSHBshPgtBVkfKwwZpmGXz', 'DCjbSqkDXcnzARnaVVfZgvD'],
				marks: [],
				annotations: []
			}
		},
		DdsgvFTegPTjhupNDNDYVTn: {
			id: 'DdsgvFTegPTjhupNDNDYVTn',
			type: 'footer_link_category',
			title: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		kwdRhJNahFccHcARVdCZcQR: {
			id: 'kwdRhJNahFccHcARVdCZcQR',
			type: 'footer_link',
			href: '',
			label: {
				content: '',
				marks: [],
				annotations: []
			},
			target: '_blank'
		},
		gHeVqdqKQrhyPMjkThksXMZ: {
			id: 'gHeVqdqKQrhyPMjkThksXMZ',
			type: 'footer_link',
			href: '',
			label: {
				content: '',
				marks: [],
				annotations: []
			},
			target: '_blank'
		},
		JskzGsAxAjwhbGdQWdMGpDS: {
			id: 'JskzGsAxAjwhbGdQWdMGpDS',
			type: 'footer_link_column',
			items: {
				nodes: ['DdsgvFTegPTjhupNDNDYVTn', 'kwdRhJNahFccHcARVdCZcQR', 'gHeVqdqKQrhyPMjkThksXMZ'],
				marks: [],
				annotations: []
			}
		},
		banner_1: {
			id: 'banner_1',
			type: 'banner',
			content: {
				content: '',
				marks: [],
				annotations: []
			}
		},
		footer_1: {
			id: 'footer_1',
			type: 'footer',
			body: {
				nodes: ['WkrTBHKFKjjCphujhzqZrup', 'fWFgvucsMbVzrEDZSSXxhWA'],
				marks: [],
				annotations: []
			},
			footer_link_columns: {
				nodes: [
					'fcSSWQUTYajjknPChgGsPZz',
					'footer_column_2',
					'VTRuBHweKUkfXmNUYcmTaHp',
					'JskzGsAxAjwhbGdQWdMGpDS'
				],
				marks: [],
				annotations: []
			}
		},
		mAnWESNCNDWdwgqWynunGjf: {
			id: 'mAnWESNCNDWdwgqWynunGjf',
			type: 'heading_1',
			content: {
				content: 'Welcome to your new Editable',
				marks: [],
				annotations: []
			},
			layout: 'regular'
		},
		DDeNCexQKbfjvufpNghRKBK: {
			id: 'DDeNCexQKbfjvufpNghRKBK',
			type: 'link',
			href: 'https://editable.website/manual',
			target: '_blank'
		},
		XRmDpRxqYhHZdpzBhAkyEGD: {
			id: 'XRmDpRxqYhHZdpzBhAkyEGD',
			type: 'link',
			href: 'https://editable.website',
			target: '_blank'
		},
		ZRHWwtvVUPXrhmXHRqdtpDS: {
			id: 'ZRHWwtvVUPXrhmXHRqdtpDS',
			type: 'paragraph',
			content: {
				content: 'Follow the tutorial to learn how editing works and read the manual.',
				marks: [
					{
						start_offset: 60,
						end_offset: 66,
						node_id: 'DDeNCexQKbfjvufpNghRKBK'
					},
					{
						start_offset: 11,
						end_offset: 19,
						node_id: 'XRmDpRxqYhHZdpzBhAkyEGD'
					}
				],
				annotations: []
			},
			layout: 'regular'
		},
		wXWNYSZFwEpXcGTngSJsyQe: {
			id: 'wXWNYSZFwEpXcGTngSJsyQe',
			type: 'prose',
			layout: 'narrow-left',
			body: {
				nodes: ['mAnWESNCNDWdwgqWynunGjf', 'ZRHWwtvVUPXrhmXHRqdtpDS'],
				marks: [],
				annotations: []
			}
		},
		rsbYSFDDKECGfkngAZEWGmF: {
			id: 'rsbYSFDDKECGfkngAZEWGmF',
			type: 'page',
			title: {
				content: '',
				marks: [],
				annotations: []
			},
			description: {
				content: '',
				marks: [],
				annotations: []
			},
			image: 'uqHVWPtxuErWwxjaCgJMwZs',
			banner: 'banner_1',
			nav: 'nav_1',
			footer: 'footer_1',
			body: {
				nodes: ['wXWNYSZFwEpXcGTngSJsyQe'],
				marks: [],
				annotations: []
			}
		}
	}
};

// Give the home page a fresh id while keeping pasted FULL_DOC data convenient.
const full_doc_nodes = FULL_DOC.nodes as Record<string, any>;
const pasted_home_page_id = FULL_DOC.document_id;
const home_page_node = full_doc_nodes[pasted_home_page_id];
if (!home_page_node || home_page_node.type !== 'page') {
	throw new Error(`FULL_DOC must contain its page root node "${pasted_home_page_id}".`);
}
delete full_doc_nodes[pasted_home_page_id];
full_doc_nodes[home_page_id] = { ...home_page_node, id: home_page_id };
FULL_DOC.document_id = home_page_id;

// ---------------------------------------------------------------------------
// Extract sub-documents using svedit's traverse utility
// ---------------------------------------------------------------------------

/**
 * Extract a sub-document: traverse from root_id collecting all reachable nodes.
 */
function extract_document(nodes, root_id) {
	const node_list = traverse(root_id, document_schema, nodes);
	const sub_nodes = {};
	for (const node of node_list) {
		sub_nodes[node.id] = node;
	}
	return { document_id: root_id, nodes: sub_nodes };
}

const FILLED_DOC = fill_document_defaults(FULL_DOC, document_schema);
const page_node = FILLED_DOC.nodes[home_page_id];
const banner_root_id = page_node.banner; // "banner_1"
const nav_root_id = page_node.nav; // "nav_1"
const footer_root_id = page_node.footer; // "footer_1"

export const default_banner_document = extract_document(FILLED_DOC.nodes, banner_root_id);
export const default_nav_document = extract_document(FILLED_DOC.nodes, nav_root_id);
export const default_footer_document = extract_document(FILLED_DOC.nodes, footer_root_id);

// The default page document gets everything reachable from the home page, minus banner/nav/footer subtrees
const banner_ids = new Set(Object.keys(default_banner_document.nodes));
const nav_ids = new Set(Object.keys(default_nav_document.nodes));
const footer_ids = new Set(Object.keys(default_footer_document.nodes));
const exclude = new Set([...banner_ids, ...nav_ids, ...footer_ids]);
const page_nodes_list = traverse(home_page_id, document_schema, FILLED_DOC.nodes);
const page_nodes = {};
for (const node of page_nodes_list) {
	if (!exclude.has(node.id)) {
		page_nodes[node.id] = node;
	}
}
export const default_page_document = { document_id: home_page_id, nodes: page_nodes };

// Merged default site document for static deployment (VERCEL=1)
export const default_site_document = {
	document_id: default_page_document.document_id,
	nodes: {
		...default_page_document.nodes,
		...default_banner_document.nodes,
		...default_nav_document.nodes,
		...default_footer_document.nodes
	}
};
