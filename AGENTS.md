# AGENTS.md

Repository-specific guidance for coding agents working on Svedit.

`README.md` is the user-facing manual and source of truth for setup, customization, and usage patterns. Consult only the relevant sections when working on those areas; keep agent-specific guidance here.

## Principles

Editable is minimalistic by design: less, but better.

- **Correctness first, optimization later.** Build on solid foundations: deterministic behavior, explicit data, and no guessing. Add optimizations as a separate, optional layer, and only once the foundation is right.
- **Keep the code small.** Every line is maintained forever. Client-side code matters most, because it is loaded for every page. A performance optimization that adds noticeable code for a small gain is not justified.
- **Remove code where it is justified.** Eliminate redundancy, dead code, and needless abstraction when the result is clearly simpler and still correct. Do not shrink code at the expense of clarity or correctness.
- **Avoid growth at all costs.** Prefer extending an existing mechanism over adding a new one. Before adding code, check whether the problem can be solved with less, and say so when a change grows the codebase noticeably.
- **Write idiomatic code.** Sites are built by adapting Editable, and its patterns get copied and repeated. Use the most idiomatic Svelte, SvelteKit, and Svedit patterns, so that what gets copied is worth copying.

## Important constraints

- For code running from `/` in no-backend/Vercel mode, do not add top-level imports of backend-only modules such as `#app/api.remote.js` or anything that imports a backend from `#lib/server/backends/`.
- In home-route server files, import backend-only code lazily inside the `has_backend` guard so static deployments do not evaluate database code at module load time.
- Files using Svelte runes (`$state`, `$derived`, `$effect`, etc.) must use the `.svelte.js` or `.svelte.ts` extension.
- Use sentence case for documentation headings and comments; capitalize `Svedit` as a proper noun.
- Read the site's origin, base path, and languages through `site` from `#app/server_site.js` on the server and `#app/client_site.js` in the browser, never from `ORIGIN` or `LANGUAGES` directly: a host serving several sites sets them per request. Documents reach the browser with internal links already under the base, so components render `node.href` as is. Links the browser makes up itself, such as asset URLs and navigation targets, go through `resolve_href(href, site)` from `#app/document_links.js`; absolute URLs use `absolute_page_url(path, site)`. Stored links never include the base.
- Use `backend` and the asset helpers from `#app/services.js` only inside functions: they go to the current request's site backend. Every backend implements the asynchronous `Backend` interface in `src/lib/server/backend.ts`; the built-in ones live in `src/lib/server/backends/`. Each backend function is atomic, so writes that belong together go into one call, such as `save_documents`; there are no transactions. Await every backend call. SQL exists only in the SQLite backend (`src/lib/server/backends/sqlite_backend.ts`) and in migrations with `target: 'sqlite'`. Content migrations, without a target, work through `backend` and the helpers and never SQL, so they run on every backend. A storage change needs a migration for every backend; `pnpm migration:create <name> --storage` writes the set. Editable computes what it stores: the asset references a document uses are rebuilt into the `asset_refs` collection on every write, and link references into `document_refs`.

## Code style

- Use tabs for indentation throughout the project, including code snippets in documentation and design system examples. Preserve spaces only where the file format requires them.
- Use `snake_case` for project-defined JavaScript and TypeScript identifiers. Keep web platform and Svelte APIs in their native `camelCase` form.
- Prefer Tailwind classes and minimize custom CSS. For CSS custom properties, use Tailwind's arbitrary-value utilities, such as `text-(--editing)` and `border-(--editing)`, where applicable.

- Prefix all project-defined CSS classes with `ew-`, including component, state, and custom utility classes. Standard Tailwind classes and classes required by third-party libraries retain their original names.

## Commits

- The person who makes a commit is its author. Do not sign commits or pull requests with an agent name: no `Co-Authored-By` trailers, "Generated with" lines, or other agent attribution in commit messages or pull request descriptions.

## UI verification

- The user manually verifies UI changes. Do not use a browser, screenshots, or computer-use tools to verify the UI unless the user explicitly asks.
- Use appropriate code checks, such as formatting, linting, and Svelte diagnostics, without starting a browser-based verification workflow.

## Design system

- Inline formatting styles (emphasis, strong, link, code, and highlight) are mutually exclusive. Never nest them or apply multiple styles to the same text.

- Consult the [design system source](src/routes/design-system/+page.svelte) before styling UI. With the development server running, the user can open [the design system in a browser](http://localhost:5173/design-system) to inspect typography, spacing, buttons, and editor pills, and inspect the source for their recipes. Shared tokens and typography utilities live in `src/app.css`. Follow the UI verification rules above for agent browser use.
- Keep the design system focused on reusable primitives, such as typography, spacing, colors, controls, and cards. Higher-level compositions and behavior belong in application code and components: for example, document the reusable Card primitive in the design system, while galleries and carousels compose it in application components.
- Keep reference examples as explicit HTML, SVG, and Tailwind classes. Repetition is intentional; application components own behavior and may adapt the recipes when their interaction requires it.
- Update existing primitive examples when component changes affect those primitives. Do not automatically add examples for every new component or layout. If unsure whether a new example belongs in the design system, ask the user before adding it.

## Architecture

Svedit is a Svelte 5 rich content editor built around a graph-based document model.

- `Session` owns document state, transactions, and history; `Transaction` performs atomic changes.
- Documents are graphs of nodes with properties and references.
- Within a document, nodes (including image, video, mark, and annotation nodes) have exactly one owning `node` field, `node_array` entry, mark range, or annotation range. Do not reference the same node from multiple fields, array entries, or ranges; copy it with a fresh id instead. Image/video edits and same-type file replacement preserve the owned node's id; changing type or pasting a copied node creates a new id.
- Navigation, footer, and the site banner are shared as separate documents referenced by pages; their child nodes still follow the single-owner rule. Multiple image/video nodes may use the same asset `src`.
- Each text mark or annotation range owns its attachment node. Splitting or duplicating a range must create an independent attachment node for the additional occurrence, so editing a link in one place cannot change another.
- Selection supports text, node, and property selections and maps between the model and the DOM.
- `Svedit.svelte` manages the editor and selection; `NodeArrayProperty.svelte` renders node sequences; `TextProperty.svelte` renders editable text with marks and annotations.

## Scrollable editor layouts

- Give wrappers that scroll editable node arrays `relative` positioning, as in `Nav.svelte`. Svedit's absolutely positioned node gaps and markers need a containing block that moves with the scrolling content. Keep the `Node` elements themselves static.
- Put horizontal gutters inside the scroll container so the first and last node gaps have space outside the content. Match `scroll-padding` to those gutters so snapped cards retain their alignment.
- Put carousel gutters on a track wrapper around `NodeArrayProperty`, not on the node array itself. Padding after the final node can trigger Svedit's trailing-gap fill/clamp calculations and place the marker over earlier cards.
- Do not add `tabindex` to scroll wrappers in editing mode: taking focus from Svedit's canvas prevents it from processing text selections. A focusable scroll region is appropriate in viewing mode.

## Schema changes

When adding a property to a node type, update both:

1. `document_schema` in `src/app/document_schema.ts`
2. `inserters` in `src/app/document_config.ts`

## Svelte documentation tools

For Svelte or SvelteKit questions, use the Svelte MCP documentation tools:

1. Call `list-sections` first.
2. Use its `use_cases` information to identify all relevant sections.
3. Retrieve those sections with `get-documentation`.
4. When writing Svelte code, run `svelte-autofixer` and address all reported issues or suggestions before delivery.
