# The Editable Manual

Editable lets you build and edit a Svelte website without adding a separate CMS. Editors work directly on the page, while the content model, components, layouts, and styling remain in the codebase you own. Use the included defaults and adapt the colors and fonts to deploy a beautiful site within minutes — or customize the entire layout and model your own content types. This manual explains how to build and run a site with Editable.

## Quickstart

From zero to a live-editable site in less than five minutes.

### Prerequisites

You need [Git](https://git-scm.com/downloads), [pnpm](https://pnpm.io/installation), and Node.js 26. Already have them? Skip to **Install**.

Starting from scratch? Install pnpm:

```sh
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

If `pnpm` is not found, open a new terminal first. Then install Node.js 26:

```sh
pnpm runtime set node 26 -g
```

### Install

The `stable` branch is the latest tested release. `main` may contain unfinished changes.

```sh
git clone --branch stable https://github.com/michael/editable.git my-site
cd my-site
pnpm install
cp .env.example .env
```

Set an admin password in `.env`:

```sh
ADMIN_PASSWORD='change-me'
```

And run the development server:

```sh
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173), press `⌘` or `Ctrl` + `E`, and log in with your `ADMIN_PASSWORD` to edit the site live.

You can also use `Ctrl` + `Shift` + `E` to edit. In read mode, admins can create a new page with `Ctrl` + `Shift` + `N`.

## Make it yours

Your repository, your styles, your components.

### Your site is your repo

Each Editable site lives in its own checkout with its own git repository — one folder, one app, one deployment. You start from Editable as a template, own all the code from day one, and keep Editable connected as `upstream` so you can pull in improvements later (see [Upgrading](#upgrading)).

Make Editable the `upstream` remote, then rename your local release checkout to `main` for your own site:

```sh
git remote rename origin upstream
git branch -m main
```

Then create an empty private repository with your git host of choice and make it `origin` — your content is backed up by the [data scripts](#backup-sync--recovery), this backs up your code:

```sh
git remote add origin <url>
git push -u origin main
```

From here on, `git push` saves your work to your own repo. To bring in Editable updates, fetch and merge the latest release: `git fetch upstream && git merge upstream/stable`. The upstream `stable` branch always points at the latest release; active development happens on `upstream/main`, which your site does not need to follow.

### Styling

With the development server running, open the [design system](http://localhost:5173/design-system) in your browser to explore typography, spacing, buttons, and editor pills. Inspect its [source code](src/routes/design-system/+page.svelte) for the corresponding markup and styles.

When customizing your Editable site, ideally update the design system first, then apply those changes to the actual site components. This gives you a concrete visual reference to work from and helps keep the site consistent, whether you build it with an agent or edit the code manually.

Adjust the colors and fonts directly in `src/app.css`:

```css
/* src/app.css */

:root {
	/* Main page background color. */
	--background: oklch(1 0 0);
	/* Main text and foreground color. */
	--foreground: oklch(0 0 0);
	/* Subtle background for secondary surfaces and hover states. */
	--muted: oklch(0.98 0 0);
	/* Color for borders, dividers, and other visual lines. */
	--stroke: oklch(0.92 0 0);
	/* Text color for secondary or de-emphasized content. */
	--muted-foreground: oklch(0.55 0 0);
	/* Strong accent color for primary actions and highlights. */
	--accent: oklch(0 0 0);
	/* Text color used on the accent color. */
	--accent-foreground: oklch(1 0 0);

	/* Primary accent for active editing controls, carets, and selections. */
	--editing: oklch(60% 0.22 283);
	/* Low-opacity version of the editing accent for passive highlights. */
	--editing-muted: oklch(from var(--editing) l c h / 0.1);
	/* Foreground color for content displayed on the editing accent. */
	--editing-foreground: var(--background);

	/* Rounded corners for buttons and navigation items. */
	--button-border-radius: 3rem;
	/* Rounded corners for images. */
	--image-border-radius: 2.2rem;
}

/* Type scale — adjust any of these utilities to match your style. */
@utility display-1 {
	@apply font-serif text-6xl leading-tight tracking-tight text-balance lg:text-7xl;
}
```

You will likely want to customize more than that. For example, edit `src/app/components/Button.svelte` to create your own distinct button style. The files in `src/app` and `src/routes` are meant to be customized for your project. Changes to `src/app.css` may need a manual merge when you pull upstream updates, just like changes to those files.

### Demo content

To reset your local database to the initial default site content (asks for confirmation and backs up your current database first; assets stay in place, and the fresh content appears on the next dev server start):

```sh
pnpm data:reset
```

## Primitives

Make Svelte components editable by composing a small set of primitives.

The schema defines what the content may contain; the primitives connect that content to the editor; your HTML and CSS decide how it looks.

The Hero from [Create a custom node type](#create-a-custom-node-type) already uses three of them. We'll take it apart, then extend it with composable buttons and editor-controlled media sizing.

Editable uses [Svedit](https://github.com/michael/svedit) as its editing engine. This chapter covers the Svedit primitives used to render content, but Svedit's separate API documentation is the reference for schemas, sessions, transactions, transforms, commands, marks, and annotations. Study that API to move beyond adapting Editable's existing patterns and build new editing behavior of your own.

### Everything starts with a path

Every registered node component receives `path`. It identifies the node being rendered, wherever that node happens to live in the document. Append a property name to address something inside it:

```js
path                           // the hero node
[...path, 'title']             // its title text
[...path, 'description']       // its description text
[...path, 'media']             // its image or video node
```

Pass those paths to primitives and use the same paths to read values when layout depends on content:

```svelte
<script lang="ts">
	import { get_svedit_context } from '#app/svedit_context.js';
	import type { DocumentPath } from 'svedit';
	import type { Nodes } from '#app/document_schema.js';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let hero: Nodes['hero'] = $derived(svedit.session.get(path));
	let media = $derived(svedit.session.get([...path, 'media']));
</script>
```

The `Nodes['hero']` annotation types the node against the schema, so `hero.` autocompletes its properties and a misspelled property fails `pnpm check`.

`session.get` follows node references for you, so the last expression returns the media node rather than its stored id. Components do not need to know whether they are on a page, inside another block, or nested several arrays deep.

### Node: establish the editing boundary

`Node` wraps the output of a node component. It gives the rendered element its document identity and connects selection, visibility tracking, node-array marks and annotations, and editor positioning:

```svelte
<Node tag="section" class="ew-hero bg-(--background) text-(--foreground)" {path}>
	<!-- The Hero's ordinary Svelte layout -->
</Node>
```

`path` is required. `tag` defaults to `div`; `class`, `style`, and other element attributes pass through to the rendered element. `Node` adds no visual layout of its own. If you need `position: relative` or `position: absolute`, put it on an element inside `Node`, because the node element itself stays statically positioned so editor overlays can anchor to it reliably.

Most block components have one outer `Node`. Mark components are the exception: they render inline content or wrap a range supplied by `TextProperty` or `NodeArrayProperty`.

### TextProperty: make text editable

The Hero's fixed text fields use `TextProperty`:

```svelte
<TextProperty tag="h1" class="display-1" path={[...path, 'title']} placeholder="Hero title" />

<TextProperty
	class="pt-4 body-xl text-(--muted-foreground)"
	path={[...path, 'description']}
	placeholder="Say what this page is about"
/>
```

`TextProperty` renders the current content and becomes directly editable when the editor is active. `path` is required. `tag` defaults to `div`; `class`, `style`, and other element attributes pass through, and `placeholder` appears while the field is empty.

The component controls presentation, but the schema controls the content rules. In the Hero schema, `allow_newlines` decides whether `Enter` is allowed and `mark_types` decides which inline formats are available; `annotation_types` can allow data-only ranges such as comments. The same `TextProperty` can therefore be a plain button label, a marked-up paragraph, or a heading without acquiring type-specific editing code.

### MediaProperty: render editable media

`MediaProperty` is Editable's project-level primitive for the `image` and `video` nodes in its schema. It makes the property selectable and renders the correct media component. Like `TextProperty`, it only needs a path:

```svelte
<MediaProperty path={[...path, 'media']} />
```

Media always fills the container, so the Hero layout owns its size and shape. For a fixed crop, give the wrapper an aspect ratio:

```svelte
<div
	class="overflow-hidden"
	style:aspect-ratio="16 / 9"
	style:border-radius="var(--image-border-radius)"
>
	<MediaProperty path={[...path, 'media']} />
</div>
```

For the uploaded media's natural shape, read its dimensions and use a placeholder ratio until something has been pasted:

```svelte
<script>
	let media = $derived(svedit.session.get([...path, 'media']));
</script>

<div
	class="overflow-hidden"
	style:aspect-ratio={media.width && media.height ? `${media.width} / ${media.height}` : '16 / 9'}
>
	<MediaProperty path={[...path, 'media']} />
</div>
```

The only props are the required `path` and an optional `class` on the outer element. Sizing, border radius, and placement remain the caller's responsibility.

### NodeArrayProperty: compose nodes inside nodes

The Hero currently has a fixed title, description, and media slot. Suppose it should also accept any number of calls to action. Add an array of existing `button` nodes to its schema:

```js
actions: {
	type: 'node_array',
	node_types: ['button'],
	default_node_type: 'button'
}
```

Initialize the new property in the Hero inserter:

```js
new_hero: {
	id: 'new_hero',
	type: 'hero',
	layout: 'side-by-side',
	title: { content: '', marks: [], annotations: [] },
	description: { content: '', marks: [], annotations: [] },
	media: 'hero_media',
	actions: { nodes: [], marks: [], annotations: [] }
}
```

Import `NodeArrayProperty` from `svedit` and place the array wherever the layout should show its buttons:

```svelte
<NodeArrayProperty class="flex flex-wrap gap-4" path={[...path, 'actions']} />
```

That one primitive renders each referenced node through `document_config.node_components`. The existing `Button.svelte` component still owns how a button looks; the Hero owns where the group sits. In edit mode the array also gets insertion points, selection, reordering, copy and paste, and an empty-state insertion point. The schema limits what may be inserted and identifies the default type.

`path` is required. `tag` defaults to `div`; `class`, `style`, and other element attributes pass through to the array container. Arrays may also carry marks and annotations, which `NodeArrayProperty` resolves and passes to their registered components.

Use a text property when the structure is fixed and only its words change. Use a node array when editors should be able to add, remove, reorder, or switch the types of the things inside.

### CustomProperty: build a new property UI

`CustomProperty` is the escape hatch for a property that is neither editable text nor an array of rendered nodes. It establishes a selectable property boundary and renders whatever visual representation you put inside:

```svelte
<CustomProperty path={[...path, 'media']}>
	<!-- Your representation of the property's current value -->
</CustomProperty>
```

`path` and a child snippet are required. `tag` defaults to `div`; `class`, `style`, and other attributes pass through. `CustomProperty` deliberately does not decide how the value changes—you pair it with your own controls, overlay, paste handler, or transaction logic.

`MediaProperty` is the concrete example in this project: it wraps `CustomProperty`, displays `Media.svelte`, and lets the shared editing overlays handle image and video replacement. Reach for `CustomProperty` when adding something similarly visual, such as a color swatch, map position, or product picker. Most content components only need the higher-level primitives above.

### SizableViewbox: let the editor shape media

`SizableViewbox` is an Editable helper rather than a Svedit core primitive. It wraps `MediaProperty` and gives the editor drag handles for maximum width and aspect ratio. To add it to the Hero, extend the schema with two presentation properties:

```js
media_max_width: { type: 'integer', default: 0 },
media_aspect_ratio: { type: 'number', default: 0 }
```

Import `SizableViewbox` from `./SizableViewbox.svelte`, then replace the fixed-ratio wrapper:

```svelte
<SizableViewbox {path} class="mx-auto">
	<MediaProperty path={[...path, 'media']} />
</SizableViewbox>
```

A value of `0` means unconstrained width or the media's natural aspect ratio. In edit mode, the left and right handles change width on a 4px grid and the bottom handle changes aspect ratio. Dragging back to the container width or close to the natural ratio resets the corresponding value to `0`. The viewbox uses `max-width` with `width: 100%`, so it does not overflow its parent.

The default property name is `media`. For another name, the helper derives the corresponding fields automatically:

```svelte
<SizableViewbox {path} media_property="logo" placeholder_aspect_ratio={1}>
	<MediaProperty path={[...path, 'logo']} />
</SizableViewbox>
```

That expects `logo_max_width` and `logo_aspect_ratio` on the containing node. `placeholder_aspect_ratio` defaults to `16 / 9`; `class` and `style` apply to the viewbox itself.

### The complete set

For ordinary content components, the vocabulary is small:

- `Node` identifies the node component's outer boundary.
- `TextProperty` renders and edits a schema `text` property.
- `NodeArrayProperty` renders and edits a schema `node_array` property.
- `CustomProperty` supplies a selectable boundary for a custom property UI.
- `MediaProperty` is Editable's ready-made `CustomProperty` for images and videos.
- `SizableViewbox` optionally adds editor-controlled sizing around media.

The first four come from `svedit`; the last two live in `src/app/components`. Components such as `Display`, `ButtonGroup`, and `SupportingMedia` are useful compositions of these pieces, not additional editing primitives. System components such as node gaps, carets, and selection markers are wired into the editor shell and normally do not appear in your content components.

## Content model

A small, typed vocabulary for Editable's pages and shared site content.

Editable's content model defines the nodes and properties available to pages and shared site content. Its schema lives in `src/app/document_schema.ts`; this section is the reference.

Documents are graphs of nodes stored by id. Each node has an `id`, a `type`, and type-specific properties. A few naming conventions hold throughout: `content` is the string payload of text properties, `body` holds authored nested content, `items` holds repeated structured children, and `label`/`title`/`description`/`meta` are text properties with semantic meaning.

A **text property** value looks like this in a document. Marks and annotations reference separate nodes by id:

```js
{
	content: 'Editable text',
	marks: [],
	annotations: []
}
```

A **node array** value holds ordered child node ids. Marks and annotations can cover ranges of children; the page body uses a `section` mark for visual grouping:

```js
{
	nodes: ['node_id_1', 'node_id_2'],
	marks: [],
	annotations: []
}
```

### Node reference

Notation: `text` is an editable text value (allowed marks in the comment), `[a | b]` is a node array of those types, and a bare type name is a single node reference. Layout values are app-defined string ids. `href` is a string where empty means unlinked; `target` defaults to `'_self'`.

**Page and site chrome** — the document root plus the shared navigation and footer:

```ts
page {
	title: text          // single line, no marks; used for page metadata
	description: text    // no marks
	image: image         // preview image for page metadata
	body: [prose | prose_grid | figure | captioned_figure | gallery | feature |
	       titled_gallery | descriptive_gallery | listing | descriptive_listing |
	       accordion | preformatted]
	                     // supports section marks for visual grouping
	nav: nav
	footer: footer
}

nav {
	start_items: [nav_media | nav_link | nav_button]    // usually logo first
	middle_items: [nav_link | nav_button | nav_media]   // usually page links
	end_items: [nav_link | nav_button | nav_media]      // usually calls to action
}

nav_link { href, target, label: text }
nav_button { layout: primary | secondary, href, target, label: text }   // type-switches with nav_link
nav_media { href, target, media: image | video }

footer {
	body: [rich content]   // see below
	footer_link_columns: [footer_link_column]
}
footer_link_column { items: [footer_link_category | footer_link] }
footer_link_category { title: text }
footer_link { href, target, label: text }
```

**Text blocks** — most bodies accept the same "rich content" family:

```ts
// rich content = paragraph_sm | paragraph | paragraph_lg | paragraph_xl |
//                heading_1_xl | heading_1 … heading_4 | list | supporting_media | button_group

prose { layout: narrow-left | narrow-center | narrow-right | narrow-centered-text |
                wide-left | wide-centered-text, body: [rich content] }
prose_grid { layout: plain | plain-centered-text | boxed | boxed-centered-text,
             items: [prose_grid_item] }
prose_grid_item { body: [rich content] }

// the paragraph and heading family share one shape:
paragraph, paragraph_sm, paragraph_lg, paragraph_xl,
heading_1_xl, heading_1 … heading_4 {
	layout: regular | muted
	content: text      // marks: strong, emphasis, code, highlight, link
}

list { layout: square | check | decimal | lower-alpha, list_items: [list_item] }
list_item { content: text }                        // marks: strong, emphasis, code, highlight, link

preformatted { content: text }                     // monospaced, preserves whitespace, no marks
```

**Media** — `image` and `video` share one shape and are interchangeable wherever media is allowed:

```ts
image, video {
	src: string              // asset id (blob URL before save)
	mime_type: string
	width: integer           // intrinsic pixels
	height: integer
	alt: string
	focal_point_x: number    // 0.5 = centered
	focal_point_y: number
	scale: number            // display scale inside the frame, 1 = fit
	object_fit: string       // CSS object-fit, default 'contain'
}

figure { layout: wide | narrow-left | narrow-center | narrow-right | flush | full-bleed,
         href, target, media: image | video }
captioned_figure { href, target, media: image | video, caption: text }   // caption marks: strong, emphasis, code, highlight, link
supporting_media {
	href, target
	media_max_width: integer      // 0 = no maximum
	media_aspect_ratio: number    // 0 = natural ratio
	media: image | video
}
```

**Collections and buttons**:

```ts
gallery { layout: mixed | portraits | squares | landscapes | compact-landscapes,
          gallery_items: [gallery_item] }
gallery_item { href, target, media: image | video }

titled_gallery { layout: cards | compact, items: [titled_gallery_item] }
titled_gallery_item {
	href, target
	media: image | video
	title: text          // single line; marks: emphasis, highlight
}

descriptive_gallery { layout: cards | compact, items: [descriptive_gallery_item] }
descriptive_gallery_item {
	href, target
	media: image | video
	title: text          // single line; marks: emphasis, highlight
	description: text    // marks: emphasis, highlight
}

listing { layout: narrow-left | narrow-center | narrow-right | full-width | two-columns,
          items: [listing_item] }
listing_item {
	href, target
	title: text          // single line; marks: emphasis, highlight
	meta: text           // single line, optional; marks: emphasis, highlight
}

descriptive_listing { layout: narrow-left | narrow-center | narrow-right | full-width | two-columns,
                      items: [descriptive_listing_item] }
descriptive_listing_item {
	href, target
	title: text          // single line; marks: emphasis, highlight
	description: text    // marks: emphasis, highlight
	meta: text           // single line, optional; marks: emphasis, highlight
}

accordion { layout: narrow-left | narrow-center | narrow-right | full-width | two-columns,
            items: [accordion_item] }
accordion_item {
	title: text          // single line; marks: emphasis, highlight
	body: [rich content without headings]
}

feature { layout: image-right | image-left, href, target, media: image | video, body: [rich content] }

button_group { buttons: [button] }
button { layout: primary | secondary | link, href, target, label: text }
```

**Marks and annotations** — both attach a separate node to a half-open range using the same shape. For text, offsets address character positions; for node arrays, they address child-node positions. `start_offset` is included and `end_offset` is excluded:

```js
{
	start_offset: 0,
	end_offset: 5,
	node_id: 'strong_1'
}
```

Marks are part of the rendered content: formatting such as emphasis and links for text, or grouping such as sections for node arrays. They are mutually exclusive within a property, so marked ranges cannot overlap. Editable defines these mark types:

```ts
strong, emphasis, code, highlight   // no properties
link { href, target }               // internal links use root-relative page URLs
section                             // groups a range of page body blocks
```

Annotations are metadata layered over content, such as comments, review markers, or application-specific labels. They may overlap marks and other annotations. Svedit preserves and transforms their ranges, but does not render them in place; your application interprets them through CSS classes, component props, or overlay UI.

Editable does not enable an annotation type by default. To add one, define an annotation node and allow it on the relevant text or node-array property:

```js
comment: {
	kind: 'annotation',
	properties: {
		author: { type: 'string' },
		body: { type: 'string' }
	}
}

// On a text or node_array property:
annotation_types: ['comment']
```

Annotation nodes must not have registered rendering components. For node arrays, child components receive every covering annotation through their `annotations` prop, and `Node` adds classes such as `anno-comment`, `anno-comment-start`, and `anno-comment-end`. Text annotations remain data-only, so comments or other interactive annotations usually need an overlay. The [Svedit API](https://github.com/michael/svedit) documents selection state, annotation commands, transactions, and rendering integration in full.

## Media uploads

When you paste or drop media into the page, it shows up instantly — the file is displayed straight from memory while processing happens in the background. Nothing touches the server until you hit save: only then are the processed files uploaded and the temporary references in the document replaced by content-addressed asset ids (`{sha256}.{ext}`). Identical files are deduplicated automatically.

All processing happens in your browser, in a background worker — there is no server-side encoding pipeline and no external service.

### Images

Static raster images (JPEG, PNG, …) are converted to WebP, capped at 4096px wide, and encoded into a fixed set of responsive size variants so pages never ship more pixels than the layout needs. SVGs and animated GIFs are stored as-is.

### Videos

Videos are transcoded to a single web-optimized MP4 (H.264 + AAC). Drop an iPhone `.mov` fresh off the camera and it comes out as a downscaled, compressed MP4 that plays everywhere. Anything your browser can decode works as input: MOV, MP4, WebM, MKV, with H.264, HEVC, VP8/VP9 or AV1 inside.

Each dropped video goes through this decision tree:

1. **Filename escape hatch** — a file named `*_optimized.mp4` (or `*.optimized.mp4`) is uploaded byte-identical, bypassing all processing and all caps. Use this when you've deliberately prepared a file — say a high-bitrate 4K export — and want it kept exactly as exported.
2. **Already good** — if the video is already H.264, within the resolution cap and within the size goal (with 25% tolerance, since re-encoding a marginally-over file costs quality and saves little), nothing is re-encoded: an MP4 is uploaded untouched, and other containers (e.g. an H.264 `.mov`) are losslessly repackaged into an MP4 container.
3. **Everything else** is transcoded to fit the size goal: the bitrate is derived from the video's duration, and the resolution is chosen as the largest that still looks good at that bitrate — starting from the resolution cap (1440 means landscape 2560×1440 _and_ portrait 1440×2560; videos are never upscaled) and stepping down (1080, 720, 540, …) for long videos where the size budget would otherwise spread too thin. Rotation is preserved.

Two knobs in `src/app/config.ts`:

```js
export const MAX_VIDEO_RESOLUTION = 1440; // cap on the short side: 1080, 1440, …
export const MAX_VIDEO_FILESIZE = 50 * 1024 * 1024; // size goal for transcoded videos
```

Things worth knowing:

- The size limit is a goal, not a hard guarantee: browser encoders treat bitrate as a target, so the output may overshoot by a few percent. Short clips usually land well under it — bitrate is also capped where extra bits stop visibly improving quality.
- For very long videos the goal wins over quality: the encoder goes down to the bottom of the resolution ladder and, past that, simply spreads the budget thin. If the result looks too rough, split the video into parts or upload a deliberate export via the escape hatch.
- Transcoding uses the browser's hardware-accelerated codecs and shows its progress in the save dialog, but a long 4K clip still takes a while — the "already good" path exists precisely so that well-prepared files skip it entirely.
- Input files are limited to 2 GB (the converted output is assembled in memory).
- Decoding HEVC (the default iPhone format) requires an HEVC decoder on your platform; most browsers have one, Firefox on some systems doesn't. If the video can't be converted you get a clear error on save — convert the file manually and re-drop it.
- A video with an audio track that can't be converted fails loudly rather than uploading without sound.

## Create a custom node type

Define a node schema and wire it up with a custom component.

Editable's built-in types are just a starting set. This walkthrough adds a `hero` type — a title, a description, and an image, with two layouts — and it touches exactly three files: the schema, one new component, and the session registration.

### 1. Define the type in the schema

In `src/app/document_schema.ts`, add the node type definition. A hero is a `block` with a `layout` variant, two text properties, and a media reference:

```js
hero: {
	kind: 'block',
	properties: {
		layout: {
			type: 'string',
			values: ['side-by-side', 'stacked'],
			default: 'side-by-side'
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
		},
		media: {
			type: 'node',
			node_types: ['image', 'video'],
			default_node_type: 'image'
		}
	}
},
```

`MINIMAL_MARKS` (emphasis and highlight) keeps the hero copy clean — swap in `ALL_MARKS` if you want links and inline code in there too. Then allow the hero on pages by adding `'hero'` to the `body` node types of the `page` definition in the same file:

```js
body: {
	type: 'node_array',
	node_types: [
		'hero',
		'prose',
		// …the existing types
	],
	mark_types: ['section'],
	default_node_type: 'prose'
},
```

That's the whole data model. Documents containing heroes now validate, and every property is editable and undoable by default — you haven't written any editing code.

### 2. Write the component

Create `src/app/components/Hero.svelte`. It reads the node at `path`, renders each property through an editable primitive (`TextProperty` for text, `MediaProperty` for the image), and picks a snippet per layout:

```svelte
<script lang="ts">
	import { Node, TextProperty } from 'svedit';
	import type { DocumentPath } from 'svedit';
	import type { Nodes } from '#app/document_schema.js';
	import { get_svedit_context } from '#app/svedit_context.js';
	import MediaProperty from './MediaProperty.svelte';

	const svedit = get_svedit_context();
	let { path }: { path: DocumentPath } = $props();
	let node: Nodes['hero'] = $derived(svedit.session.get(path));
	let layout = $derived(node.layout || 'side-by-side');
</script>

{#snippet text()}
	<TextProperty tag="h1" class="display-1" path={[...path, 'title']} placeholder="Hero title" />
	<TextProperty
		class="pt-4 body-xl text-(--muted-foreground)"
		path={[...path, 'description']}
		placeholder="Say what this page is about"
	/>
{/snippet}

{#snippet media()}
	<div
		class="overflow-hidden"
		style:aspect-ratio="16 / 9"
		style:border-radius="var(--image-border-radius)"
	>
		<MediaProperty path={[...path, 'media']} />
	</div>
{/snippet}

<Node class="ew-hero bg-(--background) text-(--foreground)" {path}>
	<div class="mx-auto max-w-7xl">
		{#if layout === 'side-by-side'}
			<div class="grid items-center gap-10 px-5 py-16 sm:px-7 md:grid-cols-2">
				<div>{@render text()}</div>
				{@render media()}
			</div>
		{:else}
			<div class="flex flex-col gap-10 px-5 py-16 text-center sm:px-7">
				<div class="mx-auto max-w-2xl">{@render text()}</div>
				{@render media()}
			</div>
		{/if}
	</div>
</Node>
```

There is no read-only twin to keep in sync: this one component is the live page **and** the editor. For fancier variants, `src/app/components/Feature.svelte` shows the same pattern with a rich `body` node array, reveal animations, and section-aware padding.

### 3. Register it in the session

In `src/app/document_config.ts`, import the component and add it to `node_components`, so Svedit knows what to render:

```js
import Hero from './components/Hero.svelte';

// in document_config.node_components:
hero: Hero,
```

The `values` array declares the valid layout ids in cycling order and powers layout switching (toolbar and `Ctrl` + `Shift` + `←` / `→`). Then add an inserter — the factory that builds a blank hero when one is inserted on a page:

```js
// in document_config.inserters:
hero: function (tr) {
	const new_hero_id = tr.build('new_hero', {
		hero_media: { id: 'hero_media', type: 'image', ...MEDIA_DEFAULTS },
		new_hero: {
			id: 'new_hero',
			type: 'hero',
			layout: 'side-by-side',
			title: { content: '', marks: [], annotations: [] },
			description: { content: '', marks: [], annotations: [] },
			media: 'hero_media'
		}
	});
	tr.insert_nodes([new_hero_id]);
},
```

### 4. Try it

Run `pnpm dev`, press `⌘` + `E` and log in. Select a top-level block on a page and cycle node types with `Ctrl` + `Shift` + `↑` / `↓` until it becomes a hero, or insert one fresh at a node gap. `Ctrl` + `Shift` + `←` / `→` flips between your two layouts, paste an image onto the media slot, and `⌘` + `S` saves — undo, selection, and copy/paste all work without any additional code, because they operate on the schema, not on your component.

From here it's just iteration: add calls to action, give editors control over the image size, add a third layout, or ask your AI assistant to do it — the three-file pattern above is all the context it needs. The [Primitives](#primitives) chapter makes those extensions while unpacking the primitives used inside the component.

## Deploy

Deploy your local site to a public URL in a few steps.

Editable runs on any VPS — all you need is Node.js, and the included `Dockerfile` works with any platform that supports Docker (see [Deploy to a VPS](#deploy-to-a-vps-experimental)). The repository ships ready-made for [Fly.io](https://fly.io), which remains the recommended default: machines scale to zero and wake in well under a second, so a personal site costs next to nothing to run. Install [flyctl](https://fly.io/docs/flyctl/install/), then sign in (opens your browser; creates a free account if you don't have one):

```sh
fly auth login
```

Create the app. Pick a globally-unique name:

```sh
fly apps create my-site
```

Now pin that name in `fly.toml` — uncomment the `app` line and set it:

```toml
app = "my-site"
```

This is your checkout's deployment identity: every `fly` command and data script from here on reads its target from it, so nothing needs an app name on the command line anymore. `fly.toml` also holds the region and VM sizing — adjust `primary_region` to a [region near you](https://fly.io/docs/reference/regions/) and commit:

```sh
git commit -am "Deploy target: my-site" && git push
```

Set the secrets. `ORIGIN` must be your app's public URL, so canonical links and social preview images resolve correctly. Pick a strong `ADMIN_PASSWORD` — it's the login to your live site:

```sh
fly secrets set \
  ORIGIN="https://my-site.fly.dev" \
  BODY_SIZE_LIMIT='100M' \
  ADMIN_PASSWORD='pick-a-strong-password'
```

`ORIGIN` should exactly match the canonical URL you use in the browser, including the scheme and subdomain (for example, `https://example.com` and `https://www.example.com` are different origins), so generated canonical and social metadata stays correct. Update this secret whenever you switch to a custom domain.

Optionally set `ASSET_GRACE_PERIOD_DAYS` (default 7): unreferenced asset files are kept on disk this many days after losing their last reference. This is also the safe window for rolling back a database backup against the live assets folder without ending up with dead image references.

Deploy. The first deploy also creates the 1 GB `data` volume declared under `[mounts]` in `fly.toml`:

```sh
fly deploy
```

Watch it boot, and confirm the volume was created:

```sh
fly logs
fly volumes list
```

Then open your site and log in with the `ADMIN_PASSWORD` you set:

```sh
fly open
```

Because each checkout manages exactly one app (see [Your site is your repo](#your-site-is-your-repo)), the target always comes from `fly.toml` — there's no app name to get wrong. If you ever do need to address a different app (say, a staging copy), every `fly` command and data script accepts `-a <app>` as an explicit override.

### Add a custom domain

First find the app's IP addresses:

```sh
fly ips list
```

Create an `A` record for the IPv4 address and an `AAAA` record for the IPv6 address at the DNS provider that is authoritative for your domain.

Then create a certificate, starting with the domain without `www`:

```sh
fly certs add example.com
fly certs show example.com
```

If you also want `www`, add a certificate for that hostname too:

```sh
fly certs add www.example.com
fly certs show www.example.com
```

For domains containing non-ASCII characters, such as `ä`, `ö`, `ü`, `ê`, or `è`, use the Punycode-encoded domain in these commands. Otherwise, `fly certs show` may not find the certificate. A search for “Punycode converter” will find tools that can convert the domain.

If Fly does not see your DNS changes, check which nameservers are authoritative for the domain. Add the records there, or change the domain's nameservers to the provider where you added them.

Finally, set `ORIGIN` to the custom domain and deploy again. It must exactly match the URL you use in the browser, including the scheme and `www`:

```sh
fly secrets set ORIGIN="https://example.com"
fly deploy
```

Without this step, the site may redirect to its `fly.dev` address and generate the wrong canonical and social metadata.

### Cache assets with Cloudflare

Cloudflare provides a free CDN and reduces bandwidth and file-serving work on your web server. Delegate your domain's nameservers to Cloudflare, and enable the proxy (orange cloud) for the DNS records that point to your site. Then add a **Cache Rule** for `/assets/`:

- **Match:** `URI` starts with `/assets/`
- **Action:** `Eligible for cache`
- **Browser TTL:** `Respect origin TTL`
- **Edge TTL:** `Use cache-control header if present, cache request with Cloudflare's default TTL for the response status if not`

Editable's content-addressed assets send `Cache-Control: public, max-age=31536000, immutable`, so long-lived caching is safe. Do not cache pages or API routes. Turn off **Email Address Obfuscation** under **Security > Settings**, and be wary of any optimization that rewrites HTML or JavaScript, since changing SvelteKit's server-rendered output can break [hydration](https://svelte.dev/docs/kit/glossary#Hydration).

Check response headers: the first asset request may show `CF-Cache-Status: MISS`; later requests should show `HIT`.

### Deploy to a VPS (experimental)

Editable runs on any amd64 host with Docker — a DigitalOcean droplet, a Hetzner or Nodion VPS. One command takes a fresh Ubuntu server to a running site with TLS.

**Docker has to be installed and running on your own machine**, because the image is built locally and streamed over ssh — check with `docker info` before you deploy. Docker on the _server_ is installed for you on the first run.

Create the server with your ssh key installed, point your domain's A record at its IP, then:

```sh
pnpm vps:deploy root@203.0.113.10 my-site.example.com
```

The first run provisions the server — Docker, [Caddy](https://caddyserver.com) as the TLS-terminating reverse proxy, swap on machines with less than 2 GB RAM — asks you for an admin password, builds the Docker image locally, streams it over ssh, and starts the site. The server never needs access to your git repository or the memory to run a build. Your content lives in `/data` on the server — the same path Fly.io mounts and the same path inside the container; deploys replace the container and never touch that folder.

After the first deploy, add one line to your **local** `.env` — this is your checkout's deployment identity, playing the role `fly.toml` plays for Fly.io. Everything else (container name, data path) is read from the server:

```sh
DEPLOY_HOST="root@203.0.113.10"            # who you ssh in as
```

With `DEPLOY_HOST` set, no command needs the server address anymore. Ship an update — build, stream, replace the container, health-check:

```sh
pnpm vps:deploy
```

See what's running and what you can roll back to — each image tag is a git commit, and the last three are kept on the server (a deploy from a working tree with uncommitted changes is tagged `<sha>-dirty` to keep experiments distinguishable from committed states):

```sh
pnpm vps:status

# → Running: editable:939761c (Up 5 minutes) — https://my-site.example.com
#
# Images on the server (newest first):
#   939761c   2026-07-20 21:35   Add env var management  ← running
#   502dcdf   2026-07-20 20:43   Harden deploy script
```

Follow the app's logs, the way `fly logs` does (Ctrl-C to stop):

```sh
pnpm vps:logs
pnpm vps:logs --tail 500        # more history before following
pnpm vps:logs --no-follow       # print and exit
```

Roll back a bad deploy by starting a previous image:

```sh
pnpm vps:deploy --tag <sha>
```

And every `pnpm data:*` command ([Backup, sync & recovery](#backup-sync--recovery)) targets the VPS too (`fly.toml` is ignored; remove or comment `DEPLOY_HOST` to target Fly.io again). Pull, push, backups, restores, point-in-time recovery — the whole toolbox behaves the same, including disaster recovery from the backup bucket on a fresh volume.

The server keeps its own `.env` (the equivalent of `fly secrets`) — inspect and change it with the `env` command:

```sh
pnpm vps:env                            # show it (secrets masked)
pnpm vps:env set BUCKET_NAME=my-backup AWS_REGION=auto
pnpm vps:env set ADMIN_PASSWORD      # no value = prompted, kept out of shell history
pnpm vps:env unset BUCKET_NAME
```

`set` and `unset` restart the app and refresh the Caddy config, so the change takes effect immediately — no deploy needed, including for `ORIGIN` and `ALIAS_DOMAINS`. For [automated backups](#automated-backups-optional), the `BUCKET_*` / `AWS_*` secrets belong in the server's `.env` — the first deploy copies them from your local `.env` if present; after that, changes are explicit via `vps:env`.

#### Extra domains (www, aliases)

`ORIGIN` is the one canonical address of your site. Any other domain pointing at the server — `www.`, a second hostname — needs to be named so Caddy can get a certificate for it:

```sh
pnpm vps:env set ALIAS_DOMAINS="www.my-site.example.com,alias.example.com"
```

Caddy then terminates TLS for all of them and the app redirects each to `ORIGIN`, so visitors and search engines end up on one address and you don't get a separate login per domain. Point each name's DNS at the server **before** setting it — Caddy verifies every name when it requests the certificate.

**Doing it by hand instead:** the script is optional — `docker-compose.yml` runs on any docker host. Clone your site on the server, `cp .env.example .env` and set `ADMIN_PASSWORD` and `ORIGIN="https://my-site.example.com"`, then `docker compose up -d --build`. The app listens on `127.0.0.1:3000`; put a reverse proxy with TLS in front (with Caddy that's the whole config: `my-site.example.com { reverse_proxy 127.0.0.1:3000 }`). Ship updates with `git pull && docker compose up -d --build`. For the data commands, a hand-managed setup has nothing to auto-discover, so set the explicit keys alongside `DEPLOY_HOST` in your local `.env`: `RESTART_CMD="docker restart editable"`, `REMOTE_EXEC="docker exec editable"`, and `HOST_DATA_DIR` pointing at the `./data` bind mount as an absolute path (without the script, the container keeps the default name `editable`).

What Fly.io still does for you that a VPS doesn't: scale-to-zero with sub-second wake-ups (a VPS runs — and bills — around the clock), TLS and anycast routing without a reverse proxy, and volume snapshots. The VPS path trades that for a fixed monthly price and no platform dependency.

## Backup, sync & recovery

Your whole site lives in one folder — pull it, push it, snapshot it, roll it back.

That folder is `data/`: an SQLite database (`db.sqlite3`) and uploaded assets (`assets/`). Locally it defaults to `./data`; on Fly.io it's a persistent volume at `/data`; on a VPS it's `/data` on the host, bind-mounted into the container at the same path. The data commands move that folder between your machine, your deployment, and — optionally — a backup bucket. The complete toolbox:

- **pnpm data:pull** — Copy the live site's data to your machine
- **pnpm data:push [--yes]** — Replace the live site's data with your local state — guarded, undoable
- **pnpm data:backup** — Snapshot the live database, kept on the server and mirrored locally
- **pnpm data:backups** — List the live site's snapshots
- **pnpm data:restore &lt;name> [--yes]** — Roll the live database back to a snapshot — pass a name from data:backups
- **pnpm data:cloud-snapshots** — List points in time you can restore to — requires automated backups
- **pnpm data:restore-cloud [--at &lt;timestamp>] [--yes]** — Roll the live site back to a point in time — requires automated backups
- **pnpm data:pull-cloud [--at &lt;timestamp>]** — Rebuild your local data folder from the bucket — requires automated backups
- **pnpm data:verify** — Health-check the deployed database and assets
- **pnpm data:reset [--yes]** — Reset your local database to fresh default site content, keeping assets
- **pnpm litestream:install** — One-time local setup for data:pull-cloud — requires automated backups

Arguments in brackets are optional; pnpm forwards them directly to the script, without an extra `--` separator. The cloud commands require [Automated backups](#automated-backups-optional). Every command reads the target app from `fly.toml`; only append `-a <app>` if no app name is set there, or to override it. Every restore prints a summary of the restored state (documents, last edited, assets) so you can confirm you got the moment you meant, and backs up the state it replaces first. `pnpm data:help` prints this reference, with arguments, in the terminal.

Pull the live site down to work on it locally, or push a local state up to production. Both directions sync the database and any missing assets.

### Why not just copy the folder?

The database runs in SQLite [WAL mode](https://www.sqlite.org/wal.html): recent writes live in a `db.sqlite3-wal` sidecar, not the main file. Copying the files of a running database loses or corrupts data. `data.sh` instead takes a consistent `VACUUM INTO` snapshot, which is safe even while the site is being edited. **Do not** back up by copying `data/` of a running instance.

Assets are content-addressed and immutable, so they only ever need to be added, never overwritten — syncs transfer just the files the other side is missing.

### Safety and undo

`push` is guarded so a bad push can't quietly break production:

- The local database is validated (integrity check plus every referenced asset present) before anything is sent.
- The current remote database is backed up first — on the volume **and** mirrored to `data-backups/` locally — before the new one is applied.
- The new database is swapped in at boot, when no connection is open, so the live database can never be corrupted mid-write.
- After the swap, the remote database is re-validated; if it fails, you're told the exact restore command.

Every push prints an undo command. To roll back:

```
pnpm data:backups          # list the live site's snapshots
pnpm data:restore <name>   # roll the live site back to one (name from the listing; file extension optional)
```

Snapshots are taken automatically before every push and restore, and on demand with `pnpm data:backup` — each lives on the server (last 10 kept) and is mirrored to `data-backups/` on your machine (kept forever, prune by hand). `restore` finds it in either place.

A rollback restores only the database; it re-points at the same immutable asset pool, which is why `ASSET_GRACE_PERIOD_DAYS` (see [Deploy](#deploy)) defines how far back you can safely go — restores from the backup bucket don't have this limit.

**Note:** don't edit the site while a push is in progress — the safeguard assumes the remote state is stable for the moment it takes to snapshot and swap.

## Automated backups (optional)

Make the site back itself up on every write, restorable to any moment.

The manual snapshots above are deliberate actions you take. Optionally, Editable can also back itself up continuously to an S3-compatible bucket: the database is replicated on every write via [Litestream](https://litestream.io) (with point-in-time recovery), and uploaded assets are mirrored to the bucket as they arrive, with a reconciliation sweep at every boot catching anything missed. Everything is write-driven — there are no cron jobs, and suspend mode (`auto_stop_machines = "suspend"`) is fully supported: a suspended machine isn't writing anything, so there's nothing to miss. (One honest edge: replication ships changes on a ~1s interval, so a suspend arriving immediately after a write can hold the last segment in memory until the next wake — data is at risk only if the volume is destroyed before the machine ever wakes again, a seconds-wide window.)

### Enabling

Create a bucket and set the secrets. On Fly, [Tigris](https://fly.io/docs/tigris/) does both in one command:

```sh
fly storage create
```

Then `fly deploy`. That's it — the presence of the `BUCKET_NAME` secret enables automated backups; without it, nothing changes. Inspect the bucket's raw contents any time with `fly storage dashboard` (`db/` holds the Litestream replica, `assets/` the asset mirror, `snapshots/` the daily full-database snapshots). Any S3-compatible provider (Cloudflare R2, AWS S3, MinIO) works by setting the same secrets manually:

```sh
fly secrets set \
  BUCKET_NAME='my-site-backup' \
  AWS_ENDPOINT_URL_S3='https://...' \
  AWS_REGION='auto' \
  AWS_ACCESS_KEY_ID='...' \
  AWS_SECRET_ACCESS_KEY='...'
```

Use one bucket per site. The bucket is append-only: local asset cleanup is never mirrored to it, so unlike volume-local rollbacks, restores from the bucket are not bounded by `ASSET_GRACE_PERIOD_DAYS` — every asset ever uploaded is still there. Replication runs as a supervised sidecar: if it ever fails, your site stays up and the logs say so loudly.

As an extra safety net independent of Litestream, a plain full-database `.sqlite3` snapshot is also uploaded to the bucket's `snapshots/` folder at most once per day (triggered by edits and boots) — restorable with no tooling at all.

All automatic uploads run only in the deployed app: local development never writes to the bucket, even with credentials in your `.env` (those exist for the read-only [local restores](#local-restores)).

### What you get

**Disaster recovery, automatically.** On boot, a machine with an empty volume restores the database from the bucket, then downloads the assets it references. If your volume (or app, or region) is ever lost: `fly deploy` against a fresh volume brings your site back.

**Point-in-time restore to production.** Roll the live database back to any moment, shipped through the same guarded swap as a push (pre-restore backup, integrity validation, verification). List the available restore points, then pick one:

```sh
pnpm data:cloud-snapshots                              # what moments can I restore to?
pnpm data:restore-cloud                                # latest bucket state
pnpm data:restore-cloud --at "2026-07-10T15:00:00Z" # a specific moment
```

`--at` takes the UTC timestamps exactly as `data:cloud-snapshots` shows them.

**Local restores.** Rebuild your local `data/` from the bucket, e.g. to investigate a past state without touching production. See [Local restores](#local-restores) below.

Restores always download only the assets the restored database references — the bucket holds full history, but a restore transfers just the site's working set as of that moment.

Continuous backups complement the manual snapshots rather than replacing them: `data:push`/`data:pull`/`data:backup`/`data:restore` remain the tools for deliberate, operational state moves.

### Local restores

Rebuild your local `data/` folder from nothing but the bucket — a new laptop, or forensic work: say the site was vandalized and you need to find the last good state. Try timestamps locally until you find it, then restore production to that exact moment. Iterating is cheap: each round downloads a small database plus only the missing assets, and your previous local database is backed up to `data-backups/` first. Nothing here ever writes to the bucket or touches production.

One-time setup — install Litestream into the project (pinned to the same version the server runs, so local restores always read the exact format the server writes) and put the bucket credentials into your `.env` (see `.env.example`; read them from the machine with `fly ssh console -C env`). Local restores only ever read, so consider using read-only credentials here — most providers let you create a second, read-only access key for the bucket; how (and whether) is up to you:

```sh
pnpm litestream:install
```

Then:

```sh
pnpm data:cloud-snapshots                           # list restore points
pnpm data:pull-cloud                                # latest bucket state
pnpm data:pull-cloud --at "2026-07-10T15:00:00Z" # a specific moment
pnpm dev                                            # inspect the restored state
```

When you've found the state you want live, restore production to it with `pnpm data:restore-cloud --at <timestamp>`.

## Upgrading

New Editable releases are one `git pull` away.

Because your site keeps Editable as the `upstream` remote (see [Your site is your repo](#your-site-is-your-repo)), improvements flow in with ordinary git. The ritual, in order:

```sh
pnpm data:backup            # snapshot the live database first
git fetch upstream          # download available Editable releases
git merge upstream/stable   # merge the latest Editable release
pnpm install                # update dependencies (including svedit)
pnpm data:pull              # bring your live content local
pnpm dev                    # test the new code against your real content
fly deploy                  # ship it
git push                    # your repo now holds the upgraded state
```

The order is the safety net: back up before touching anything, and test the new code against your real content locally before deploying it. `git merge` is deliberate: your site and Editable will normally have different commits, and merging incorporates the upstream release without rewriting your site's history. Database schema migrations run automatically when the new code boots, locally and on the server.

If Git reports conflicts, run `git status`, resolve the marked files, then finish with `git add <resolved-files>` and `git commit`. If you want to abandon the upgrade before committing, run `git merge --abort`. Releases are also tagged: to upgrade to a specific version instead of the latest, use `git fetch upstream` followed by `git merge v2.1.0`.

Merge conflicts can only occur in files you changed. If your customizations are limited to `src/app.css`, the `app` line in `fly.toml`, and your own code in `src/app` and `src/routes`, pulls are usually straightforward. If a conflict occurs, review the upstream changes and keep the parts that apply to your site.

The app-specific Editable surface lives in `src/app`, while `src/routes` contains the SvelteKit route files. Customize the modules and components in `src/app` rather than the implementation modules in `src/lib` whenever possible. Keeping your schema, default site content, config, session setup, and components in `src/app` makes the intended extension points clear and reduces upgrade conflicts.

## Database migrations

Keep stored content and database structure in step with changes to your site.

Migration files in `src/app/migrations` are discovered when SvelteKit builds the server and run automatically when it boots. Framework migrations use the `editable` namespace and project migrations use the `custom` namespace; their UTC timestamps determine the normal order. All pending migrations plus their tracking records run in one transaction: either the complete upgrade succeeds or nothing changes.

Create a project migration with:

```sh
pnpm migration:create add-project-metadata
```

This creates a timestamped `custom` migration. Its filename is its permanent ID:

```js
export default {
	up({ db, rename_property, rename_type, replace_value, delete_property, update }) {
		// Transform content with the helpers, or the database with `db`.
		// rename_property('hero', 'image', 'media');
	}
};
```

Adding a custom content type usually needs no migration because documents are stored as JSON. Write one when existing documents or database structure must be transformed.

### Content helpers

Content lives as JSON inside the `documents` table, so changing a node type's shape means rewriting that JSON rather than altering a column. The helpers on the `up` context do that for you — each one scans every document (pages, nav, and footer), applies the change to nodes of the given type, and returns how many nodes it changed. Every helper takes the node type first, and where a before and after are involved, the old value comes before the new one:

```js
export default {
	up({ rename_property, rename_type, replace_value, delete_property, update }) {
		// Rename a property, keeping its value
		rename_property('hero', 'image', 'media');

		// Rename a node type
		rename_type('teaser', 'card');

		// Replace one value with another
		replace_value('feature', 'layout', 'left_right_split', 'two_columns');

		// Drop a property you removed from the schema
		delete_property('hero', 'subtitle');

		// Anything else: mutate each matching node directly
		update('hero', (node) => {
			node.title = { ...node.title, content: node.title.content.trim() };
		});
	}
};
```

They are deliberately tolerant: a node that never had the property is left alone, so a migration written for one node type does nothing on sites that never used it. The exception is a rename onto a property that already exists — that is a real conflict and aborts the upgrade. Documents that end up unchanged are not rewritten, and `updated_at` is never touched, because a migration is not a content edit.

`rename_type` also updates the `documents.type` column, which mirrors the type of each document's root node. For block types nothing matches there and only the nodes change.

`delete_property` exists because stored content does not clean itself up. Saving a page drops nodes that are no longer reachable, but properties are written back exactly as they were loaded — so a property you removed from the schema stays in every document, and in every backup, until a migration removes it.

`db` remains available for everything else — schema changes, `site_settings`, or content queries the helpers don't cover. It is the [node:sqlite](https://nodejs.org/api/sqlite.html) database handle, so `exec` runs statements and `prepare` gives you one to run with parameters. Adding a column and backfilling the rows that need it is the typical case:

```js
export default {
	up({ db }) {
		db.exec('ALTER TABLE documents ADD COLUMN locale TEXT');

		const result = db.prepare('UPDATE documents SET locale = ? WHERE locale IS NULL').run('en');

		console.log(`Backfilled locale on ${result.changes} documents`);
	}
};
```

`run()` reports how many rows a statement touched, which is worth logging — a migration that reports `0` is usually a migration that matched nothing. Migrations are synchronous and may only change SQLite; filesystem, network, and other external side effects cannot be rolled back. Migrations are forward-only: never rename, delete, or edit one that has been applied. Roll back an upgrade by restoring the database snapshot made before deployment.

Editable's own migrations use the `editable` source name; `custom` migrations belong to your project. The timestamp-first filenames keep both sources in one chronological list without a central registry or sequence-number conflicts.

Exceptionally, a project migration may need to prepare customized data before a pending Editable migration. Generate it with an explicit constraint:

```sh
pnpm migration:create reconcile-heading \
	--before 20260712T125641379Z_editable_add_page_metadata_fields
```

The generated `before` array overrides timestamp order for that relationship only. The target must exist and still be pending; missing targets, already-applied targets, and dependency cycles abort the upgrade before any changes are committed. Prefer tolerant migrations that safely do nothing when their source shape is absent, and reserve `before` for genuine conflicts.

## Markdown pages (experimental)

Publish docs and long-form pages straight from markdown files in your repo.

A deployment can expose selected repository markdown files as read-only pages rendered through the regular page components. Markdown stays the source of truth — nothing is written to the database, and the pages cannot be edited through any UI path (not even as admin). This very README is served as `/manual` on the Editable website.

### Configuration

Any markdown file in the repository can be mapped to a URL in `src/app/content_config.ts` (server/build-only — never import it from client code). Reference the file with a `?raw` import, so Vite inlines exactly the mapped files and a missing file fails the build:

```js
import manual_md from '../../README.md?raw';

export const MARKDOWN_SOURCES = [
	{ markdown: manual_md, source: 'README.md', pathname: '/manual', toc: true }
];
```

- `markdown` — the imported file content
- `source` — the file's repo-relative path, so error messages point at the file to fix
- `pathname` — absolute single-segment URL the page is served at (nested paths are not supported yet)
- `toc` (optional) — generate a table of contents from the file's headings

With `MARKDOWN_SOURCES = []` the feature is inert. A configured pathname wins over a database page with the same slug, and is reserved: a page you create called "Manual" gets the slug `manual-2` when `/manual` is a markdown page, and typing `manual` into the Page URL dialog is rejected. Configuration errors — unknown fields, duplicate pathnames, missing content — fail the dev server or production build immediately.

Mapping a pathname that an existing page already occupies is the one case the reservation cannot prevent. That page becomes _shadowed_: the markdown page serves the URL, the page keeps its slug and reappears the moment the markdown entry is removed. Shadowed pages are listed in a startup warning and carry a `URL TAKEN` badge in the page browser, where you can give them a different Page URL.

### Table of contents

With `toc: true`, the headings one level below the file's first heading become a linked two-column listing, inserted before the first of them. A typical manual has one `#` title followed by `##` chapters: the title and intro prose render first, then the table of contents, then the chapters. Each row links to its chapter and shows the first sentence of the chapter's first paragraph as a description. Files with fewer than two chapter headings get no table of contents.

Headings get stable ids using GitHub's anchor algorithm, so the same `#fragment` links work in the repo view and on the website (`## Getting started` → `#getting-started`, and duplicates get `-1`/`-2` suffixes). One divergence: anchors starting with a digit get an `h-` prefix on the website.

### Sections

Every `##` heading starts a new visual section: the heading and everything up to the next `##` (paragraphs, lists, code blocks) are grouped under one section mark on the page body, which renders them tightly together with more space between sections — the same section mechanism editable pages use. Content before the first `##` (typically the `#` title and intro) forms a leading section together with the generated table of contents.

### Descriptive listings

An unordered list where every item follows the pattern below is rendered as a `descriptive_listing` (title, description, and optional meta rows) instead of a plain list — the command reference in [Backup, sync & recovery](#backup-sync--recovery) is one:

```s
- **title** — description
- **title** — description — meta
```

Bold leading title, `—` separators (em dash), plain text otherwise. If any item deviates, the whole list renders as a plain list.

### Supported markdown

The converter accepts the subset of CommonMark that maps onto the built-in content model, and rejects everything else with an error naming the file, line, and column — authored text is never silently dropped or restructured:

- paragraphs and headings 1–4, mapped directly to Editable's Heading 1–4 (Markdown headings 5 and 6 are rejected)
- `**strong**`, `*emphasis*`, `` `inline code` ``, and `[links](/page)` — but not nested inside one another (marks are mutually exclusive in the content model, so e.g. bold text inside a link is rejected)
- unordered lists (rendered with square markers) and ordered lists (rendered numbered); nested lists and multi-paragraph items are rejected
- fenced and indented code blocks (no syntax highlighting)
- HTML comments (skipped — they render as nothing, same as everywhere else)
- link targets: `http(s):`, `mailto:`, site-absolute paths, and `#fragments`; other protocols and links to `.md` files are rejected

Not supported (rejected with an error): images, tables, blockquotes, raw HTML, thematic breaks, footnotes, YAML frontmatter, and GFM extensions. Page metadata (title, description) is derived from the first heading and paragraph, as for regular pages. Soft line wraps render as spaces and hard breaks render as line breaks (trailing backslash or two trailing spaces), matching how CommonMark renderers like GitHub's display the same file.
