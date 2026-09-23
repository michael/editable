# Multi-language support implementation plan

## Product decision and rationale

**Decision: develop multi-language support as a deliberately limited, opt-in experimental feature.** Its behavior, configuration, and translation storage format may change, and the feature may be removed if it does not fit Editable. Treat it as an experiment with a maintenance cost, not a small switcher enhancement. Validate the editing boundary first and use a real bilingual site to drive the first implementation.

### Does this complicate the simple design?

Yes. The storage addition is small, but a second language changes what loading, editing, saving, navigation, and undo mean. Rich-text attachments, shared footer ownership, source changes, and stale saves are real complexity. Making the feature opt-in hides that complexity from single-language site owners; it does not remove it from the codebase or from future maintenance.

However, the proposed model preserves Editable's central idea: the developer owns one website and content model, and editors change content directly on the page. One original graph plus sparse text overrides is a coherent extension of that model. Separate page trees, layout variants, translation jobs, and approval workflows would be a much larger change to the product.

The relevant trade-off is the total work required to deliver and maintain a client site. Without built-in support, a bilingual project needs a custom implementation, duplicated pages, separate sites, or another CMS. Duplicated pages are initially simple but require repeated structural edits and create opportunities for content to drift. Reimplementing translations in each site's fork would also make upstream upgrades harder. A shared implementation can reduce that recurring cost when the requirement appears often enough.

### Is it a deal breaker for many clients?

We do not have evidence to quantify how many of Editable's prospective clients need it. Issue #43 demonstrates interest, not market size. A single-language portfolio, local service site, or technical project may never need translation. Deliberately serving only that audience would be a valid product decision.

For a client whose launch brief requires two languages, though, language support is an acceptance requirement. It can disqualify a website tool regardless of how pleasant its editing experience is. Plausible segments include tourism businesses, organizations serving multiple language communities, and companies communicating with both domestic and international customers. These are target-market hypotheses to validate, not measured demand for Editable.

There is supporting evidence for the importance of language to website visitors: [CSA Research's 2020 survey](https://csa-research.com/l/media/Consumers-Prefer-their-Own-Language) covered 8,709 consumers in 29 countries and reported that 76% of online shoppers preferred product information in their native language. This is older consumer/e-commerce research, not evidence that 76% of website clients require multilingual CMS support. [W3C's guidance](https://www.w3.org/International/questions/qa-mono-multilingual) likewise treats the choice as dependent on audience, purpose, and available resources, rather than recommending translation for every site.

The case for adding it is therefore access to a relevant class of projects that otherwise cannot use Editable comfortably. It does not depend on proving that most sites need it.

### Why it fits Editable

- **The user-facing workflow stays familiar.** Choose a language, edit text on the page, and save. There is no separate CMS or translation dashboard to learn.
- **The original stays independently useful.** Existing JSON remains complete, exports and backups still contain a readable original, and removing translation configuration leaves a functioning original-language site.
- **One structure serves all languages.** Adding or moving a block is done once. Missing translations use the original, so an editor can translate incrementally.
- **Custom content can participate consistently.** Schema-defined text properties give custom components the same translation mechanism without each site building its own translation storage.
- **Single-language adoption stays simple.** No required configuration, extra setup step, or visible language controls when the feature is disabled.

These benefits apply to sites that share structure and media across languages. A client requiring different pages, images, legal copy workflows, or layouts per market needs capabilities beyond this proposal; do not position the feature as a complete localization platform.

### Boundaries that make the complexity worthwhile

Keep one original language, one structure, text-only overrides, explicit language URLs, manual translation, and original-language fallback as the product contract. Do not expand it into per-language layout editing, arbitrary property translation, locale-specific media, automatic translation, translator permissions, or publishing workflows without a separate product decision.

The detailed plan below records necessary edge cases, not equal priority for every enhancement. For the initial rollout, prioritize a complete and safe read/edit/save/switch workflow. Rich-text correctness, original-data isolation, shared-record ownership, stale-save protection, and preserving unsaved edits cannot be deferred. Translation progress dashboards, elaborate review tooling, and additional discovery surfaces can wait; a basic source-changed indication is enough initially. Keep public URL and metadata behavior coherent from the outset.

The first technical spike is a decision gate: can translation mode reliably restrict edits to text without invasive changes throughout Svedit and every application component? If it requires fragile interception of core editing behavior, pause and reconsider the editing interface or defer the feature. Do not ship a visually restricted editor that can still corrupt originals through keyboard or paste operations.

### When to build it, and when to defer it

Support the direction now, but let a concrete bilingual project justify implementation priority. Walk through that project's actual content and confirm that shared structure/media and manual translation are acceptable. Use it to evaluate the attachment codec, editing restrictions, and maintenance burden before broadening the feature.

Defer implementation if the immediate users are overwhelmingly single-language, core editing still needs significant stabilization, or the technical spike shows disproportionate editor changes. Permanently excluding multilingual support makes sense only if Editable deliberately chooses that narrower audience and communicates the limitation clearly.

The recommended product position is: Editable remains simple by default and supports translating the same site when needed. This is worth a bounded increase in internal complexity for a tool intended to build real client websites; it is not a reason to adopt the broader machinery of a localization CMS.

## Experimental status and compatibility contract

Label the feature experimental in the README, environment example, and administrator-facing translation controls. Public visitors should see an ordinary language switcher, without an experimental warning.

- Without application language configuration, Editable must behave exactly as it does today: the same original document, editing/save workflow, URLs, metadata, HTML language default, and visible controls.
- Gate the whole feature, not just the switcher. Disabled mode must not perform translation reads/writes, apply translation editing restrictions, interpret `?lang=`, rewrite links, or add language-specific metadata. Existing translation rows do not activate the feature by themselves.
- An additive empty database table is acceptable while disabled; no original JSON rewrite or setup step is required.
- Removing the opt-in configuration restores existing behavior without deleting stored translations. The original remains self-contained throughout the experiment.
- Experimental status permits redesign or removal in future releases; it does not relax original-data isolation or save correctness. Document incompatible changes in release notes. Before changing storage incompatibly or removing the feature, provide a documented backup/export path for existing translations rather than silently deleting them.
- Keep translation code behind a small configuration/service boundary so ending the experiment does not require rebuilding the original editing path.

## Goal and scope

Add experimental, opt-in translations to Editable while preserving the current document JSON as the complete, authoritative original. A translated page is the original document with selected text property values replaced at load time. Structure, media, layout, page slugs, and non-text properties on structural nodes stay shared. Nodes owned by text attachments, including link marks and their properties, belong to the text payload and are replaced with it.

This follows [issue #43 and its design discussion](https://github.com/michael/editable/issues/43#issuecomment-3702293484), refined by the current requirements. This document is a plan; no application behavior changes with this commit.

The first release includes:

- Environment-configured languages, with the first language defining the original.
- Sparse translations keyed by language, document, node, and text property.
- Server-rendered translated pages with fallback to the original for missing translations.
- Translation editing and saving through the existing editor.
- A language switcher immediately below the footer, visible only when additional languages are enabled.
- Translated page titles and descriptions, since these already are text properties.

Excluded: automatic translation, localized editor labels, translated slugs, language-specific page structure, media or `media.alt` translation, arbitrary string properties, and repository markdown body translation.

## Current implementation and integration points

| Area                                                                 | Existing behavior                                                              | Planned change                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `src/env.ts`                                                         | Validates environment variables; marks client-safe configuration public        | Add optional public language configuration                        |
| `src/app/api.remote.ts`                                              | Loads a combined graph; saves separate page, nav, and footer records           | Add language-aware reads and a separate translation write command |
| `src/app/document_schema.ts`                                         | Distinguishes `text` from `string`, `node`, and `node_array`                   | Use the schema to identify translatable properties                |
| `src/lib/document_graph.ts`                                          | Traverses nodes and mark/annotation references                                 | Reuse traversal and ownership rules                               |
| `src/app/components/App.svelte`                                      | Creates a Svedit session and saves the combined graph, including media uploads | Track language/baselines and select the correct save path         |
| `src/app/components/Page.svelte`                                     | Renders nav, body, footer, and page metadata                                   | Place the switcher after the footer and localize metadata URLs    |
| `src/routes/+page.server.ts`, `src/routes/[page_id]/+page.server.ts` | Load home, database, or markdown pages                                         | Resolve language and return overlaid documents                    |
| `src/routes/+layout.server.ts`                                       | Loads shared metadata and the not-found document                               | Provide language configuration and translated shared content      |
| `src/app/migrations.ts`, `src/app/migrations/`                       | Discover and execute database migrations at startup                            | Add an additive translations-table migration                      |

Two details must drive the implementation:

1. The editor sees one graph, but the database owns page, navigation, and footer content in separate records. A footer translation belongs to the footer's `document_id`, regardless of which page was being edited.
2. A text value contains `content`, `marks`, and `annotations`. Attachments reference property-owned graph nodes: text attachment nodes are not reused across properties. A translation replaces both the complete text value and its owned attachment nodes; translating only `content` would leave incorrect ranges or dangling references.

## Configuration and language selection

### Environment contract

Use `LANG` as requested, replacing the earlier `PUBLIC_LANG` proposal:

```dotenv
LANG="en,de,es"
```

Declare it as optional server configuration in `src/env.ts` and expose only the parsed application language configuration through load data. Add a commented experimental example to `.env.example` and document it in the README.

`LANG` is also a conventional operating-system locale variable, so its mere presence cannot count as opting in. Reserve the comma-separated list form for Editable: only a list containing at least two distinct valid language tags enables the experiment. Ignore inherited single locale values such as `en_US.UTF-8`, `C.UTF-8`, or `en`. Verify environment-loading precedence during implementation so a documented application setting actually takes effect even when the shell supplies `LANG`; include a process-level configuration example if needed.

- Missing or blank: translations are disabled, current URLs and document behavior remain unchanged, and the switcher is absent. Keep the existing English HTML language default without asserting that legacy content is English.
- A single value, or a list with fewer than two distinct languages: leave the feature disabled and preserve all existing behavior. There is no separate single-language configuration mode in this experiment.
- Multiple languages: first is `main_language`; the rest are additional languages. Preserve configured order.
- Trim entries, canonicalize valid language tags, deduplicate, and reject malformed comma-separated opt-in lists with a useful startup error. Ordinary inherited single-value OS locales must not cause a startup error.
- Accept both generic and regional tags, such as `en`, `de`, and `en-GB`. Only configured tags are selectable. Missing translations fall directly back to the original; regional fallback chains are outside this release.
- Removing an additional language hides it and rejects new writes for it, but retains its rows for later re-enabling.
- Changing the first language reinterprets the original JSON; it does not translate it. Document that this requires an explicit content migration. Merely reordering additional languages is safe.

### URL contract — recommended first-release choice

Use `?lang=de` for translated pages. Keep the original at `/` or `/about` without a language parameter. This avoids restructuring routes or colliding with existing slugs.

- These URL rules apply only while the experiment is enabled. An absent parameter selects the original. An unknown language falls back to the original and is removed when generating canonical/switcher links.
- An explicit original-language parameter is equivalent to the parameter-free URL.
- Preserve other query parameters and the hash when switching languages.
- Preserve the chosen language on same-site page navigation, page drawer navigation, and historical-slug redirects. External links, asset URLs, and hash-only links retain their behavior.
- Use a shared URL helper at rendering/navigation boundaries; never write language parameters into stored `href` values. Cover link marks, buttons, cards, nav/footer links, and programmatic navigation.
- Do not add automatic browser-language detection or cookie persistence initially. The URL is the single source of truth for SSR, sharing, refresh, and back/forward navigation.
- Include language in remote-query arguments and cache keys, rather than relying on hidden request state. Refresh/invalidation must distinguish languages.

The query-parameter choice is a recommendation, not a requirement from the issue. Decide on it before implementation if language-prefixed paths are preferred.

## Storage model

Add a `translations` table through a new framework migration, without rewriting existing `documents.data`:

```sql
CREATE TABLE translations (
	document_id TEXT NOT NULL,
	language TEXT NOT NULL,
	node_id TEXT NOT NULL,
	property_id TEXT NOT NULL,
	value TEXT NOT NULL,
	source_hash TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	PRIMARY KEY (document_id, language, node_id, property_id)
);
```

`property_id` is the schema property name, such as `title` or `content`, rather than a positional path. Node IDs remain stable across reorderings. The primary key also supports fetching one language for a small set of document IDs.

`value` stores the self-contained JSON payload described below: `{ translation: TEXT_PROPERTY, nodes: { ... } }`. Keep any future payload version metadata separate from these two fields. `source_hash` fingerprints the normalized original text payload when the translation was last edited; it supports detecting source changes without copying the original text into every row.

Keep cleanup explicit in the existing database transactions. Do not depend solely on foreign-key cascades without verifying SQLite foreign-key enforcement. Whole-database backup, restore, and replication naturally include the new table; verify any reset/export/import scripts for assumptions about table names.

### Rich text representation

Implement serialization, hydration, validation, and semantic comparison together in a pure module, proposed as `src/app/translations.ts`.

The payload shape is:

```ts
{
	translation: TEXT_PROPERTY,
	nodes: { /* All annotation/mark nodes owned by this text property. */ }
}
```

`translation` is the complete Svedit text property, including `content`, `marks`, and `annotations`. `nodes` contains the actual node records referenced by those attachments, including `strong`, `link`, and other allowed attachment types. A link's `href` and `target` are stored in this payload, not resolved through a reference back to the original annotation node.

Ownership is local to each text property. Assume text attachment nodes are never shared between properties; a single property may refer to its own node more than once. Collect and deduplicate the complete owned attachment closure. Do not extend this assumption to structural nodes or node-array annotations.

- Persist text, attachment ranges, and owned nodes as one unit. No references from a translation's attachment closure may depend on original annotation nodes or another translation record.
- During substitution, remove the original property's entire owned text attachment closure from the working graph, replace the property, and insert the translation's nodes. Remove the original nodes even when the translated property has no attachments. This prevents unused original annotations from remaining in the graph supplied to Svedit or the page renderer.
- Perform substitution only on a cloned working graph. The original `documents.data` and editing baseline keep their original text and nodes unchanged.
- Validate the complete payload before removing anything. An invalid translation leaves the original property and its nodes intact and falls back as a unit.
- Remap translation-local node IDs and all corresponding references on hydration to prevent collisions with surviving graph nodes. On save, collect the edited property's current attachment closure and serialize only its reachable nodes; removed formatting must not leave unused nodes in the translation record.
- Compare and hash the complete `{ translation, nodes }` payload semantically. Canonicalize local attachment IDs so fresh IDs alone do not create overrides. Preserve meaningful whitespace, formatting, ranges, and annotation node properties. A link destination difference is a real payload difference.
- Reject attachment types not permitted by the property's schema, invalid ranges, overlapping mutually exclusive inline styles, structural nodes hidden in `nodes`, and references outside the owned closure.
- Treat an intentionally empty translation as a value. Row absence alone means fallback. Resetting to the original removes the override and restores the original property with its original attachment closure on the next overlay.
- Original formatting/link edits do not silently mutate an existing translation's nodes. They change the source hash and can flag the translation for review. Removing an original annotation does not invalidate a self-contained translation that still uses its own equivalent annotation.

Existing internal-slug maintenance must also rewrite matching internal `href` values inside stored translation payloads; the current original-document rewrite alone is insufficient. Keep `document_refs` based on the shared original structure as today; translation-owned link destinations do not define additional structural page-tree edges. Language query parameters remain a rendering concern and are not persisted in annotation nodes.

Verify the exact Svedit attachment shape and normalization behavior before implementing the payload codec. Add round-trip fixtures for both `marks` and `annotations`, including multiple references to one node within a single property.

## Read path

Keep the requested “replace translations” step separate from reading the original:

1. Resolve the selected language and load the original page/nav/footer JSON through the existing backend path.
2. Record ownership from the individual records before composing them. Do not derive trusted ownership from client data or assume every node belongs to the page.
3. If translations are disabled or the selected language is the main language, return the normal document without querying the translations table.
4. Otherwise, fetch rows for the selected language and all participating document IDs in one query.
5. Clone the original graph. For each valid translation, remove that property’s original owned attachment nodes, replace the complete text property, and merge the hydrated translation-owned nodes. Preserve structural nodes, all other properties, and the attachment nodes belonging to untranslated properties.
6. Validate the result and return the translated document. Missing rows, removed properties, or incompatible payloads fall back to the original property; log invalid persisted payloads server-side.
7. For authenticated editing, also return the canonical baseline, ownership metadata, existing override state, and per-document revision tokens. Avoid sending a second full original graph to ordinary readers unnecessarily.

Use this service for home and slug routes, shared nav/footer content, and language-aware page previews/drawer summaries. Ensure the title/description extraction happens after overlay. Keep favicon, images, asset references, and the canonical page tree independent of language.

A changed source hash marks an existing translation as needing review but does not silently discard valid translated wording. Missing properties or invalid translation-owned attachment references are different: they require fallback. Changes to original annotation nodes alone do not break a self-contained translation. Untranslated properties immediately show any updates to the original.

## Write paths and editing rules

### Saving the original language

Keep `save_document` as the canonical write path. Existing callers without a language remain original-language callers. Updated clients must pass explicit language context, and the endpoint must reject non-main-language requests.

Continue splitting and saving page/nav/footer records, updating references and slugs, and handling assets as today. In the same transaction:

- Delete translation rows whose node disappeared or whose property is no longer a text property, across all languages for the affected records.
- Delete rows now semantically equal to the original; preserve valid differing rows and their previous source hashes so review status remains visible.
- Keep translations attached when a block merely moves within the same document. Cross-document moves require explicit ownership migration; do not silently reassign rows.

### Saving an additional language

Add a dedicated authenticated command, proposed as `save_translations`. `App.svelte` selects it before entering the media upload path.

Prefer an explicit patch of changed text properties and reset operations over deleting/replacing every row for a page. This refines the issue's earlier wholesale-replacement idea and avoids overwriting untouched shared navigation/footer translations.

For each save:

1. Send the selected language, page ID, changed text payloads/reset operations, and revision tokens for the original records and target-language rows used to build the session.
2. Require the existing admin session and validate that the language is configured and additional.
3. Inside one transaction, re-read the original records and translations. Reject stale baselines with a conflict response; do not turn outdated fallback text into a new translation.
4. Derive permitted document/node/property ownership from the current canonical graph. Reject unknown property owners, non-text property targets, arbitrary shared documents, and structural changes. New nodes are permitted only inside the validated text attachment closure; their schema-defined properties, including link destinations, are part of the translated text payload.
5. Normalize and compare each submitted text-and-nodes payload with the current original property and its owned nodes. If equal, delete its translation row; if different, upsert its payload and current source hash.
6. Apply explicit “use original” operations as row deletions. Preserve untouched rows, including translations flagged for source review; do not update their source hash merely because another property was saved.
7. Commit page, nav, and footer translation changes atomically. Do not modify original JSON, canonical timestamps, slugs, asset references, or document references.
8. Trigger the existing snapshot mechanism and refresh language-specific page/preview data. Return fresh baselines/revision tokens.

Use server-issued hashes of the exact canonical records and language-specific translation sets as initial revision tokens. Check them inside the write transaction. This avoids a mandatory revision-column migration and catches changes to shared records, including row deletions. Conservative conflicts are acceptable initially; retain the user's draft and offer reload/retry instead of silently overwriting.

### Translation editing mode

Translation mode permits editing text and its supported inline formatting. It must not permit inserting, deleting, reordering, or replacing structural nodes; changing media; changing layouts; creating pages; duplicating pages; or changing page slugs or structural link properties. Editing link marks inside a translated text property changes only that translation’s owned link nodes and is permitted.

Enforce this at both the editor transaction boundary and the server write boundary. Hiding toolbar buttons is insufficient: Enter, Backspace across blocks, paste, drag/drop, and keyboard shortcuts can also change structure. Inspect Svedit's current extension points; if needed, add a small supported transaction-policy API upstream rather than patching `node_modules`.

- Keep translated text editable through `TextProperty`, including page title/description and shared nav/footer labels.
- Expose the active language and provide a per-property “use original” action. Distinguish fallback from overridden text and indicate translations needing review without adding database terminology to the UI.
- Initialize a fresh session/history when document or language changes, even when fallback makes the two language documents identical. Never reuse undo history across languages.
- Track the loaded translated baseline separately from the original so saving one edit does not create rows for untouched fallback properties.
- Before switching languages with unsaved edits, offer Save, Discard, or Cancel. Save failure/conflict must keep the current language and draft. Prevent switching during an in-flight save.
- Keep demo edits local and language-scoped. Logging in must not accidentally promote a translated demo graph into the original document.
- New pages and duplication start from original-language records with fresh IDs and no copied translations. Shared nav/footer translations remain attached to their existing records.

## Switcher, metadata, and special routes

Add a small `LanguageSwitcher.svelte` after the footer wrapper in `Page.svelte`, outside editable document content. It is application UI, not a stored document node. Show it only when effective language configuration contains at least one additional language.

Use accessible language names, identify the current choice, support keyboard operation, and use normal links for viewing. Editing mode routes activation through the unsaved-change guard. Follow the existing design-system source and shared tokens; do not add a new design-system composition solely for this feature.

Set the HTML `lang` correctly for SSR and client navigation, replacing the hardcoded `en` in `src/app.html` through the appropriate server/layout integration. Mark fallback text with its original language where practical. Derive document direction for supported right-to-left languages and include a manual layout check if those languages are configured.

For translated database pages, generate language-specific canonical/social URLs and reciprocal `hreflang` links, with `x-default` pointing to the original. Preserve original-language URLs. Extend sitemap generation consistently for public language variants and make translation updates contribute to appropriate `lastmod` values without changing canonical document timestamps.

Special cases:

- Repository markdown bodies stay read-only and untranslated. On backend deployments, their shared nav/footer can still use translations. Do not advertise untranslated markdown bodies as fully localized SEO variants; their content language remains the original.
- The not-found page can translate shared nav/footer but keeps its fixed application message in English for this release. Avoid indexable locale alternates for errors, editor-only routes, and previews.
- No-backend/Vercel mode continues rendering the original/default content. Effective translation support is disabled there in this release, even if multiple languages are configured, so no nonfunctional switcher appears. Document this limitation; static translation bundles would be a separate feature.
- Preserve lazy backend imports inside `has_backend`/`VERCEL` guards, especially on the home and layout paths. No language helper shared with static rendering may import the database transitively.

## Delivery sequence

1. **Establish the representation and editor boundary.** Verify Svedit attachment serialization and a viable transaction guard. Add representative rich-text fixtures and decide the exact payload contract before building the UI.
2. **Add configuration and storage.** Implement language parsing/URL helpers, the additive migration, the pure text codec, and backend translation access. Prove disabled mode leaves existing documents untouched.
3. **Implement translated reads.** Preserve ownership while composing, batch-fetch overrides, overlay before SSR, and pass language explicitly through remote queries. Cover home, slug, shared documents, previews, and markdown/404 exceptions.
4. **Implement safe writes and lifecycle.** Add authenticated sparse patches, source/revision checks, equality-based deletion, reset, original-save cleanup, and page-deletion cleanup. Deleting a page must not delete shared nav/footer translations. Review migration helpers so property renames either migrate translation keys explicitly or remove obsolete rows.
5. **Integrate translation editing.** Apply text-only transaction policy, select the correct save command, isolate histories, and preserve drafts on save/switch failures. Keep original editing behavior intact.
6. **Add switching and public navigation.** Place the switcher, propagate language in links, update HTML language and metadata, and verify cache/invalidation behavior.
7. **Document and validate rollout.** Update README/config examples and run the checks below. Deploy the additive migration with translations disabled first, then enable an additional language on a test site.

## Verification and acceptance criteria

Add focused Vitest coverage for the feature's invariants:

- Configuration: missing/blank/single/multiple languages, inherited OS `LANG` values, explicit application configuration precedence, invalid opt-in lists, regional tags, duplicates, and removed languages.
- Overlay: zero translation queries in original mode; sparse property fallback; no mutation of original objects; shared nav/footer ownership; original attachment nodes absent only for replaced properties; unrelated attachment nodes preserved; no dangling references; invalid payload fallback preserves the original closure.
- Rich text: changed lengths, emoji/non-ASCII ranges using Svedit's indexing convention, formatting-only differences, empty translations, local attachment ID remapping, self-contained translated link properties, source annotation deletion, internal-slug rewrites in translation records, and semantic equality despite regenerated IDs.
- Saves: unauthenticated/unsupported-language rejection; forged ownership/non-text edits rejection; insert/update/delete/reset; unchanged fallback creates no rows; other languages remain untouched; source/translation conflicts preserve drafts; multi-record writes roll back atomically.
- Lifecycle: new blocks fall back; reorder preserves translations; removed nodes/properties/pages clean up correctly; shared translations survive page deletion; duplication copies originals only; source edits retain valid translations with review status.
- Editor policy: structural keyboard/paste/drag transactions are rejected while text edits and supported formatting work; undo does not cross languages.
- Routes and URLs: direct translated requests, internal navigation, back/forward, hashes/query preservation, old-slug redirects, metadata, remote-query language isolation, and markdown exceptions.
- Compatibility: without opt-in configuration, existing fixtures retain the same load/save, links, query handling, metadata, HTML language, and UI behavior; persisted translation rows do not activate the feature; disabling translation leaves original JSON intact; `VERCEL=1` builds without evaluating backend imports.

During implementation, run focused tests, `pnpm check`, `pnpm lint`, the relevant broader test suite, and backend/static builds. Use the required Svelte documentation tools and autofixer when writing Svelte code. Respect repository guidance: UI verification is performed manually by the user, without agent browser or screenshot checks unless requested.

Manual acceptance walkthrough: enable `en,de`, translate a heading and footer label, save and reload; verify German on another page's shared footer; switch back and confirm the original is unchanged; edit an original untranslated paragraph and see the fallback update; reset a translation; try switching with an unsaved draft; finally remove the application `LANG` setting and confirm the original site behaves normally.

The feature is ready when existing sites need no configuration changes, translated saves cannot overwrite originals, untranslated properties consume no translation rows, and every visible language selection survives loading, navigation, editing, and saving consistently.
