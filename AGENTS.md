# AGENTS.md

Repository-specific guidance for coding agents working on Svedit.

`README.md` is the user-facing manual and source of truth for setup, customization, and usage patterns. Consult only the relevant sections when working on those areas; keep agent-specific guidance here.

## Important constraints

- For code running from `/` in no-backend/Vercel mode, do not add top-level imports of backend-only modules such as `#app/api.remote.js` or anything that imports `#lib/server/db.js`.
- In home-route server files, import backend-only code lazily inside the `has_backend` guard so static deployments do not evaluate database code at module load time.
- Files using Svelte runes (`$state`, `$derived`, `$effect`, etc.) must use the `.svelte.js` or `.svelte.ts` extension.
- Use sentence case for documentation headings and comments; capitalize `Svedit` as a proper noun.

## Code style

- Use tabs for indentation throughout the project, including code snippets in documentation and design system examples. Preserve spaces only where the file format requires them.
- Use `snake_case` for project-defined JavaScript and TypeScript identifiers. Keep web platform and Svelte APIs in their native `camelCase` form.
- Prefer Tailwind classes and minimize custom CSS. For CSS custom properties, use Tailwind's arbitrary-value utilities, such as `text-(--editing)` and `border-(--editing)`, where applicable.

- Prefix all project-defined CSS classes with `ew-`, including component, state, and custom utility classes. Standard Tailwind classes and classes required by third-party libraries retain their original names.

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
- Selection supports text, node, and property selections and maps between the model and the DOM.
- `Svedit.svelte` manages the editor and selection; `NodeArrayProperty.svelte` renders node sequences; `TextProperty.svelte` renders editable text with marks and annotations.

## Scrollable editor layouts

- Give wrappers that scroll editable node arrays `relative` positioning, as in `Nav.svelte`. Svedit's absolutely positioned node gaps and markers need a containing block that moves with the scrolling content. Keep the `Node` elements themselves static.
- Put horizontal gutters inside the scroll container so the first and last node gaps have space outside the content. Match `scroll-padding` to those gutters so snapped cards retain their alignment.
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
