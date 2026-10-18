# Integrating Editable

The [manual](README.md) covers building and running an Editable site. This guide is for running Editable as part of something larger: keeping a site somewhere other than its SQLite database, serving several sites from one Node process, or bringing your own sign-in. All of it is experimental, and its interfaces may change between releases.

## Backends

Store a site wherever you want: in SQLite, in plain files, or in a system of your own, kept in your fork without conflicts when you merge Editable's releases.

Editable reaches its data in three layers:

- **The API** is what Editable does: save a document, load a page, upload an asset, sign in. It lives in `src/app`, such as `server_documents.ts` and `server_translations.ts`, and validates content, works out what each document links to and which assets it uses, and rewrites links when a page moves. It is the same for every site and reaches the current one's backend as `backend` from `#app/services.js`.
- **The backend** stores what the API hands it. It implements the `Backend` interface in `src/lib/server/backend.ts`: one function for each thing the API reads or writes, each write atomic.
- **The storage** is whatever a backend is built on, such as a SQLite handle or a folder. Each backend defines its own, exposes it as `backend.storage`, and hands it to its storage migrations.

Saving a page, for example, ends in one call that the backend carries out all at once:

```ts
await backend.save_documents({
	expect: { [page_id]: page_version, [nav_id]: nav_version },
	documents: [{ document_id: page_id, type: 'page', data, created_at, updated_at }],
	document_refs: [{ document_id: page_id, target_ids }],
	asset_refs: [{ document_id: page_id, asset_ids }],
	translations: { delete: [{ document_id: page_id, language: 'de' }] }
});
```

Editable comes with two backends. The deployment's own comes from `create_backend` in `src/app/backend.ts`, which picks one by what the data folder holds; a host serving several sites passes one per site (see [Hosting several sites](#hosting-several-sites)).

| Backend          | Records                          | Assets                  | Use                                                                                   |
| ---------------- | -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| `sqlite_backend` | SQLite, in `data/db.sqlite3`     | Files, in `data/assets` | The default, and what deployments, backups, and the `pnpm data:*` commands use        |
| `files_backend`  | EDF and JSON files, in `data/db` | Files, in `data/assets` | Sites you want to read, diff, and version as files; see [File storage](#file-storage) |

### The backend interface

`src/lib/server/backend.ts` defines the interface and its record types. All functions are asynchronous:

| Records                   | Functions                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documents                 | `get_document`, `list_documents`, `save_documents` (documents and everything that changes with them), `delete_page`                                              |
| Page URLs                 | `resolve_slug`, `get_active_slug`, `list_slugs`                                                                                                                  |
| References                | `list_document_refs`, `list_asset_refs`                                                                                                                          |
| Translations and settings | `list_translations`, `save_translations`, `get_setting`, `list_settings`                                                                                         |
| Sign-in and MCP (private) | `get`, `save`, and `delete` for sessions, the login throttle, and OAuth clients, grants, and tokens; `take_oauth_token`, `revoke_oauth_grants`, `delete_expired` |
| Assets                    | `write_asset`, `read_asset`, `asset_size`, `delete_asset`, `touch_asset`, `list_assets`                                                                          |
| Storage migrations        | `applied_migrations`, `run_migration`                                                                                                                            |

A backend keeps these promises:

- **Each write is atomic** and none interleave: with SQLite or Postgres, one transaction per call. A backend over stores that cannot commit together comes as close as they allow; see [Writing to two stores](#writing-to-two-stores).
- **Versions catch concurrent edits.** Each write gives a document or translation a new `version`, such as a random token or a Git blob hash. A save checks its `expect` versions first, `null` meaning the record must not exist, and otherwise throws a `ConflictError` and writes nothing; the editor then asks to reload.
- **Private records stay private, and per site.** Sessions, the login throttle, and OAuth records let people in; see [Keep each site's private records apart](#keep-each-sites-private-records-apart).
- **Expired entries go without a scan:** `delete_expired(now)` removes them in one step, such as one `DELETE … WHERE expires_at <= $1` per table.
- **Assets are opaque.** Which ones are unused, and when they may go, is the API's decision.

The built-in backends are synchronous inside, so each call runs to its end before the next.

### Keep a backend in your fork

Merging an Editable release never touches a backend of your own:

- **It lives in files of your own,** such as `src/app/backends/git_backend.ts`, with its storage migrations in `src/app/migrations` targeting its name. Editable ships nothing in `src/app/backends`.
- **One file wires it up:** return it from `create_backend` in `src/app/backend.ts`, which Editable keeps to that one function.
- **Interface changes arrive as type errors,** which `pnpm check` names, not as merge conflicts.
- **Editable's backend tests run against it,** including those that later releases add:

```ts
import { test_backend } from '#lib/server/backends/backend_tests.js';
import { migrate_storage } from '#app/migrations.js';
import { git_backend } from './git_backend.js';

test_backend('git', async () => {
	const backend = git_backend(await test_storage());
	await migrate_storage(backend);
	return backend;
});
```

- **Each storage change stops it until you decide.** An Editable release that adds a SQLite table stops your site from starting until your backend has its own file for that change, even an empty one; add it with `--join` (see [Placing a migration](README.md#placing-a-migration)). Content migrations run on every backend without your help.

### Write your own backend

As an example, a backend that commits a site's content to a Git repository, so it is versioned and reviewable on any Git host, and keeps everything private, plus the references, in Postgres, and uploads in an S3-compatible bucket. The same shape fits any public document store next to a private database. A sketch, with the small helpers left out:

```ts
import type { Backend } from '#lib/server/backend.js';

export type GitStorage = { git: GitRepository; sql: Sql; bucket: Bucket };

export function git_backend(storage: GitStorage): Backend {
	const { git, sql } = storage;
	return {
		name: 'git',
		storage,
		// Content: one file per record, such as documents/<id>.edf; its version is the blob hash
		get_document: (document_id) => read_document(git, document_id),
		save_documents: (save) =>
			atomically(storage, async (tx) => {
				await assert_versions(tx, save.expect);
				for (const record of save.documents ?? [])
					tx.files.put(`documents/${record.document_id}.edf`, to_edf(record));
				// …references in Postgres, translations, slugs, and settings
			}),
		// Private: one Postgres table each
		get_session: async (session_id) =>
			(await sql`SELECT * FROM sessions WHERE session_id = ${session_id}`)[0] ?? null,
		// Assets: objects in the bucket
		write_asset: (asset_id, data, variant) => put_object(storage, asset_id, variant, data),
		run_migration: (id, up) =>
			atomically(storage, async (tx) => {
				await up(tx);
				await tx.sql`INSERT INTO _migrations (id) VALUES (${id})`;
			})
		// …
	};
}
```

How a backend meets the interface is its own business: a real one would cache reads from the Git host, or keep a working copy and write changes back after each save. A host serving many sites creates one per site, with its owner's credentials.

#### Writing to two stores

No transaction spans Postgres and a Git repository, and a pushed commit can only be reverted. `atomically` comes close to all or nothing by making Postgres the anchor and committing to the repository last: the SQL runs in one Postgres transaction, file changes are collected, they become one commit that moves the branch only if it still points where it did when the work began, and Postgres commits after that.

```ts
async function atomically<T>(storage: GitStorage, work: (tx: GitTransaction) => Promise<T>) {
	const parent = await storage.git.head();
	// sql.begin commits when the callback resolves and rolls back when it throws.
	return storage.sql.begin(async (sql) => {
		const files = collected_files(storage.git, parent);
		const result = await work({ ...storage, sql, files });
		if (files.changes.length)
			await storage.git
				.commit({ parent, changes: files.changes, message: 'Save from Editable' })
				.catch((error) => {
					throw is_not_fast_forward(error) ? new ConflictError('The repository changed.') : error;
				});
		return result;
	});
}
```

| Fails at                                    | Afterwards                                                                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The work, or the commit                     | Postgres rolls back and the branch did not move: nothing changed                                                                       |
| The Postgres commit, after the branch moved | The repository has the commit, Postgres does not; a storage migration runs again on the next start, a save with the editor's next save |

Idempotent changes make the last row harmless, such as writing a file with its final content or `ADD COLUMN IF NOT EXISTS`. A storage migration runs through `atomically` too, so one can change both stores as one step:

```ts
export default {
	target: 'git',
	async up({ sql, files }: GitTransaction) {
		await sql`ALTER TABLE document_refs ADD COLUMN IF NOT EXISTS path TEXT`;
		for (const path of await files.list('pages/'))
			files.move(path, path.replace(/^pages\//, 'documents/'));
	}
} satisfies Migration;
```

The `pnpm data:*` commands, backups, and Litestream work on `sqlite_backend`'s data folder; a backend of your own brings its own backups.

## File storage

Keep a site in plain files instead of a SQLite database: every document as an EDF file, every other record as JSON, so the folder can be read, diffed, and versioned like source code.

Convert your site in place, with the dev server stopped:

```sh
pnpm data:convert --to files
```

Editable reads the format from the data folder, so `pnpm dev` then opens the files. The site lives in `data/db`: `documents/<id>.edf` for each page, banner, nav, and footer, `documents.json` with their types and timestamps, and one JSON file each for slugs, settings, translations, references, sessions, the login throttle, and MCP connections. `_migrations.json` lists the storage migrations it has run. Assets stay in `data/assets`, shared by both formats.

The conversion copies the site's content, references, and settings. Sign-ins and MCP connections start over: sign in again, and reconnect MCP clients. The database the conversion replaced moves to `data-backups/` as a regular backup that `pnpm data:backups` lists. `pnpm data:convert --to sqlite` converts back the same way, keeping the files version in a dated folder in `data-backups/`.

A new, empty data folder starts with SQLite, or with files when `STORAGE=files` is set. For an existing folder, `STORAGE` must match the format it holds or be left unset. A folder holding both formats, which an interrupted conversion can leave behind, is refused until one of them is moved out.

Each file is written atomically, but a save that touches several files is not one transaction. Deployments always use SQLite, which a new volume starts with, and so do backups, Litestream, and the `pnpm data:*` commands. File storage suits demos and archiving locally:

- `pnpm data:pull`, `data:pull-cloud`, `data:restore`, and `data:reset` install a SQLite database. A local site kept as files moves to `data-backups/` first, as a dated folder of its records.
- `pnpm data:push`, `data:backup`, `data:verify`, and `data:translations` stop at a site kept as files and ask you to run `pnpm data:convert --to sqlite` first.

## Hosting several sites

A deployment normally serves one site, configured by `ORIGIN` and `LANGUAGES`. A hosting service that serves several sites from one process can set the site per request instead: in its own `handle` hook, running before Editable's, it sets `event.locals.site`:

```ts
event.locals.site = {
	origin: 'https://host.example',
	base: '/alice',
	languages: [],
	backend,
	auth
};
```

- `origin` is the public origin, used for canonical URLs, the sitemap, and the canonical host redirect.
- `base` is the path the site is served under, or `''` at the root. Stored links never include it: `/about` stays `/about` in the database, reaches the browser as `/alice/about` the way language prefixes do, and is stored without it again, so a site can move to another path or its own domain without changing content. Components render `node.href` as is; asset URLs and the editor's own navigation go through `resolve_href(href, site)`.
- `languages` lists the site's languages, the main language first, or none.
- `backend` is where the site's records and asset files go (see [Backends](#backends)), such as a data folder's from `backend_for(dir)` in `src/app/server_backend.ts`. Run `migrate` from `src/app/migrations.ts` on it first, which also seeds a new site. Editable caches nothing between requests; opening, caching, and closing backends is up to the host. Asset cleanup deletes files no record refers to, so a host sharing asset files between sites gives each a `delete_asset` that keeps them.
- `auth` decides who is signed in and how they sign in, replacing the admin password. It implements `get_user(event)`, `log_in(event, credentials)`, and `log_out(event)` (types in `src/app/server_auth.ts`). `get_user` returns the signed-in user, or `null`, and Editable puts it on `event.locals.user`; whoever is signed in may edit. The user is an object of your own shape: Editable's admin password signs in `{ username: 'admin', name: 'Admin' }`, and an OAuth host might use `{ id, email }`. It reaches the browser as page data, so keep secrets out of it. `log_in` receives whatever the login dialog sends to `login_admin`; Editable's own dialog sends `{ password }`. It either starts a session or returns `{ ok: true, redirect }` to continue elsewhere: to sign in with OAuth, have your own login dialog send a username, return the provider's authorization URL, and handle the callback in a route of your own that sets your session, which `get_user` then reads. `event.url` in `log_in` is the page the login started from. Editable's own password sign-in names its session cookie after the site's base, `ew_admin_session` at the root and `ew_admin_session_alice` under `/alice`, so sites sharing an origin keep their sign-ins apart; an auth of your own scopes its cookies the same way.

To replace the login dialog itself, for example to ask for a username, to offer several sign-in providers, or when embedding Editable in another environment, set your own component in place of `AuthDialog` as `auth_dialog` in `system_components` in `src/app/document_config.ts`. It opens in the same drawer and receives `onlogin_success`, to call after signing in on the page, and `onedit_for_fun`, for editing without saving (see `AuthDialogProps` in `src/app/components/AuthDialog.svelte`):

```ts
system_components: {
	overlays: Overlays,
	auth_dialog: LoginDialog
},
```

Requests for `/alice/...` must reach Editable's routes, either through a proxy that strips the base or through a `reroute` hook that maps `/alice/about` to `/about`. When no site is set, Editable uses its own from the environment and opens its backend from `create_backend` on first use, so single-site deployments need no changes. Backups and the `pnpm data:*` commands work on `DATA_DIR` and are not used for host-provided backends.

Commands sent by the editor carry the page's path, so `event.url` is the page URL and the host can read the site from it. Queries do not, so for them a path-based host can only find the site through the `Referer` header; a host that gives each site its own hostname has no such gap. Routes the host adds, such as a registration page, need adding to `RESERVED_ROUTE_SLUGS` in `src/app/config.ts`, or a page of the root site could take their path.

Each site is its own MCP server and OAuth authorization server at its origin and base, with its clients and approvals in its own backend. For a site under a path, the discovery documents are expected at the host root with the site's path inserted, as in `/.well-known/oauth-authorization-server/alice` and `/.well-known/oauth-protected-resource/alice/mcp`, so the host's `reroute` maps those to Editable's discovery routes as well.

### Keep each site's private records apart

Each site's backend must only see its own records, above all the private ones: Editable finds a session by its cookie and an MCP token by its hash, so a table two sites share would let one site's session or token into the other, and failed sign-ins on one would lock out the other. A data folder per site, through `backend_for(dir)`, keeps them apart by construction. A host that keeps every site's private records in one shared database creates each site's backend with the site's id, and that backend puts a `site_id` column into every private table's key and every query, `delete_expired` included.
