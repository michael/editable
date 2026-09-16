<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { dev } from '$app/env';
	import { goto, invalidate, refreshAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Svedit, KeyMapper, Command, define_keymap } from 'svedit';
	import Toolbar from './Toolbar.svelte';
	import SaveProgressModal from './SaveProgressModal.svelte';

	import { EXT_TO_MIME } from '#app/config.js';
	import { create_session } from '#app/session.js';
	import { create_page_browser, set_page_browser } from '#app/page_browser_context.svelte.js';
	import type { PageBrowser } from '#app/page_browser_context.svelte.js';
	import {
		create_page_url_dialog,
		set_page_url_dialog
	} from '#app/page_url_dialog_context.svelte.js';
	import {
		create_page_delete_dialog,
		set_page_delete_dialog
	} from '#app/page_delete_dialog_context.svelte.js';

	import { default_site_document } from '#app/default_site.js';

	let {
		document: doc,
		slug = null,
		has_backend = false,
		is_new = false,
		is_admin: server_is_admin = false,
		can_edit = true,
		origin = null,
		document_title = null,
		children
	}: {
		document?: any;
		slug?: string | null;
		has_backend?: boolean;
		is_new?: boolean;
		is_admin?: boolean;
		can_edit?: boolean;
		origin?: string | null;
		document_title?: string | null;
		children?: Snippet;
	} = $props();

	// Backend availability and document editability are independent: read-only
	// documents (e.g. markdown pages) arrive with can_edit false but must still
	// render their own content, even without a backend.
	let initial_doc = $derived(doc ?? default_site_document);

	let initial_doc_json = $derived(JSON.stringify(initial_doc));

	let app_el = $state<HTMLElement>();
	let svedit_ref = $state<{ focus_canvas: () => void }>();
	let toolbar_ref = $state<{ open_page_menu: () => void; close_page_menu: () => void }>();
	let editable = $state(false);
	let current_is_new = $state(false);
	let edit_for_fun_saved_doc = $state<{ document_id: string; doc_json: string } | null>(null);
	let is_admin = $derived(server_is_admin);
	let is_admin_mode = $derived(editable && is_admin);

	let save_progress_visible = $state(false);
	let save_progress_message = $state('');
	let save_progress_done = $state(false);
	let save_progress_percent = $state<number | null>(null);

	let browser_data_version = $state(0);

	let auth_dialog_open = $state(false);
	let mobile_overscroll_triggered = $state(false);
	let mobile_overscroll_timeout_id = $state(null);
	let mobile_touch_active = $state(false);
	let mobile_touch_started_at_page_end = $state(false);

	const app = {
		get page_content() {
			return can_edit ? undefined : children;
		},
		get has_backend() {
			return has_backend;
		},
		get can_edit() {
			return can_edit;
		},
		get is_admin() {
			return is_admin;
		},
		get origin() {
			return origin;
		},
		get document_title() {
			return document_title;
		},
		get slug() {
			return slug;
		},
		get is_new() {
			return current_is_new;
		},
		get auth_dialog_open() {
			return auth_dialog_open;
		},
		set auth_dialog_open(value) {
			auth_dialog_open = value;
		},
		close_auth_dialog,
		edit_for_fun,
		handle_auth_success
	};

	setContext('app', app);

	const page_browser: PageBrowser = create_page_browser({
		goto,
		is_admin: () => app.is_admin
	});

	Object.defineProperty(page_browser, 'version', {
		get() {
			return browser_data_version;
		}
	});

	page_browser.invalidate = invalidate_page_browser_data;

	set_page_browser(page_browser);

	const page_url_dialog = create_page_url_dialog();
	set_page_url_dialog(page_url_dialog);

	set_page_delete_dialog(create_page_delete_dialog());

	$effect(() => {
		document.documentElement.style.scrollBehavior = editable ? 'auto' : 'smooth';
	});

	$effect(() => {
		current_is_new = !!is_new;
		if (current_is_new) {
			editable = true;
		}
	});

	function focus_canvas() {
		if (svedit_ref) {
			svedit_ref.focus_canvas();
		}
	}

	function invalidate_page_browser_data() {
		browser_data_version += 1;
	}

	function check_browser_support() {
		const ua = navigator.userAgent;
		let browser = null;
		let version = 0;

		if (ua.includes('Chrome/')) {
			browser = 'Chrome';
			version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Firefox/')) {
			browser = 'Firefox';
			version = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
			browser = 'Safari';
			version = parseInt(ua.match(/Version\/(\d+)/)?.[1] || '0');
		}

		const min_versions = { Chrome: 142, Firefox: 147, Safari: 26 };

		if (browser && min_versions[browser] && version < min_versions[browser]) {
			return { supported: false, browser, version, required: min_versions[browser] };
		}

		return { supported: true };
	}

	function open_auth_dialog() {
		auth_dialog_open = true;
		mobile_overscroll_triggered = true;
	}

	function close_auth_dialog() {
		auth_dialog_open = false;
		mobile_overscroll_triggered = false;
		clear_mobile_overscroll_timeout();
	}

	function clear_mobile_overscroll_timeout() {
		if (mobile_overscroll_timeout_id) {
			clearTimeout(mobile_overscroll_timeout_id);
			mobile_overscroll_timeout_id = null;
		}
	}

	function is_mobile_touch_device() {
		if (typeof window === 'undefined') return false;
		return window.matchMedia('(pointer: coarse)').matches;
	}

	function is_at_page_end() {
		const scroll_top = window.scrollY || window.pageYOffset || 0;
		const viewport_height = window.innerHeight || 0;
		const document_height = document.documentElement.scrollHeight || 0;
		return scroll_top + viewport_height >= document_height - 2;
	}

	function handle_mobile_overscroll_check() {
		if (
			!can_edit ||
			!is_mobile_touch_device() ||
			editable ||
			is_admin ||
			auth_dialog_open ||
			!mobile_touch_active
		) {
			clear_mobile_overscroll_timeout();
			return;
		}

		const at_page_end = is_at_page_end();

		if (!at_page_end) {
			mobile_overscroll_triggered = false;
			clear_mobile_overscroll_timeout();
			return;
		}

		if (
			!mobile_touch_started_at_page_end ||
			mobile_overscroll_triggered ||
			mobile_overscroll_timeout_id
		) {
			return;
		}

		mobile_overscroll_timeout_id = setTimeout(() => {
			mobile_overscroll_timeout_id = null;
			const still_at_page_end = is_at_page_end();

			if (
				is_mobile_touch_device() &&
				!editable &&
				!auth_dialog_open &&
				!mobile_overscroll_triggered &&
				mobile_touch_active &&
				mobile_touch_started_at_page_end &&
				still_at_page_end
			) {
				open_auth_dialog();
			}
		}, 1000);
	}

	function handle_mobile_touchstart() {
		if (!can_edit || !is_mobile_touch_device() || editable || is_admin || auth_dialog_open) return;
		mobile_touch_active = true;
		mobile_touch_started_at_page_end = is_at_page_end();
		if (!mobile_touch_started_at_page_end) {
			mobile_overscroll_triggered = false;
		}
		clear_mobile_overscroll_timeout();
		handle_mobile_overscroll_check();
	}

	function handle_mobile_touchend() {
		mobile_touch_active = false;
		mobile_touch_started_at_page_end = false;
		mobile_overscroll_triggered = false;
		clear_mobile_overscroll_timeout();
	}

	function enter_edit_mode() {
		clear_mobile_overscroll_timeout();
		editable = true;
		close_auth_dialog();
	}

	async function handle_auth_success() {
		clear_mobile_overscroll_timeout();
		await refreshAll();
		close_auth_dialog();
	}

	function edit_for_fun() {
		enter_edit_mode();
	}

	class EditCommand extends Command {
		is_enabled() {
			return can_edit && !this.context.editable;
		}

		execute() {
			if (!can_edit) return;

			const browser_check = check_browser_support();
			if (!browser_check.supported) {
				alert(
					`Your browser (${browser_check.browser} ${browser_check.version}) may not fully support the editor. For the best experience, please upgrade to ${browser_check.browser} ${browser_check.required} or newer.`
				);
			}

			if (!has_backend || is_admin) {
				enter_edit_mode();
				return;
			}

			open_auth_dialog();
		}
	}

	class CancelCommand extends Command {
		is_enabled() {
			return this.context.editable;
		}

		async execute() {
			session.selection = null;

			if (current_is_new) {
				await goto(resolve('/'));
				return;
			}

			const saved_doc_json =
				has_backend && !is_admin && edit_for_fun_saved_doc?.document_id === loaded_document_id
					? edit_for_fun_saved_doc.doc_json
					: initial_doc_json;
			session = create_session(JSON.parse(saved_doc_json));
			this.context.editable = false;
		}
	}

	class SaveCommand extends Command {
		is_enabled() {
			return can_edit && editable;
		}

		async execute() {
			// Keep this log so the saved document can be copied into default_site.js.
			const doc_json = session.to_json();
			if (dev) console.log('Saved', doc_json);

			if (!has_backend || !is_admin_mode) {
				if (has_backend && !is_admin) {
					edit_for_fun_saved_doc = {
						document_id: loaded_document_id,
						doc_json: JSON.stringify(doc_json)
					};
				}
				session.selection = null;
				this.context.editable = false;
				return;
			}

			const save_start = Date.now();

			const [api_module, asset_upload_module] = await Promise.all([
				import('#app/api.remote.js'),
				import('#app/asset_upload.js')
			]);

			const save_document: any = api_module.save_document;

			const {
				collect_blob_urls,
				wait_for_processing,
				has_pending_processing,
				ensure_processing,
				upload_pending,
				replace_blob_urls,
				cleanup_pending
			} = asset_upload_module;

			save_progress_visible = true;
			save_progress_done = false;
			save_progress_percent = 0;
			save_progress_message = 'Saving…';

			try {
				let mapping = null;
				const pre_check = session.to_json();
				const blob_urls = collect_blob_urls(pre_check.nodes);

				if (blob_urls.length > 0) {
					await ensure_processing(blob_urls);

					if (has_pending_processing()) {
						save_progress_message = 'Processing media…';
						await wait_for_processing(({ progress }) => {
							save_progress_percent = Math.round(progress * 100);
						});
					}

					save_progress_message = 'Uploading media…';
					mapping = await upload_pending(blob_urls, ({ phase, index, total: upload_total }) => {
						if (phase === 'uploading') {
							save_progress_percent = Math.round((index / upload_total) * 100);
						}
					});
				}

				save_progress_message = 'Saving…';

				const doc_json = session.to_json();
				if (mapping) {
					replace_blob_urls(doc_json.nodes, mapping);
				}

				const result: { ok: boolean; document_id?: string; slug?: string; created?: boolean } =
					await save_document({
						...doc_json,
						create: current_is_new
					});

				if (mapping) {
					const tr = session.tr;
					for (const [blob_url, entry] of mapping.entries()) {
						for (const node of Object.values(pre_check.nodes)) {
							if ((node.type === 'image' || node.type === 'video') && node.src === blob_url) {
								const ext = entry.asset_id.slice(entry.asset_id.lastIndexOf('.') + 1);
								tr.set([node.id, 'src'], entry.asset_id);
								tr.set([node.id, 'width'], entry.width);
								tr.set([node.id, 'height'], entry.height);
								if (EXT_TO_MIME[ext]) {
									tr.set([node.id, 'mime_type'], EXT_TO_MIME[ext]);
								}
							}
						}
					}
					session.apply(tr);
					cleanup_pending(mapping);
				}

				session.selection = null;

				// When a new document has been created, return and redirect to the new url
				if (result?.created && result.document_id && result.slug) {
					current_is_new = false;
					await goto(resolve('/[page_id]', { page_id: result.slug }), {
						replaceState: true,
						invalidate: ['app:site_metadata']
					});
					return;
				}

				this.context.editable = false;
				invalidate_page_browser_data();
				await invalidate('app:site_metadata');

				// Display "saved" message only if saving took longer than 3 seconds
				if (Date.now() - save_start > 3000) {
					save_progress_message = 'Successfully saved';
					save_progress_done = true;
					await new Promise((resolve) => setTimeout(resolve, 1500));
				}

				save_progress_visible = false;
			} catch (err) {
				console.error('Save failed:', err);
				save_progress_visible = false;
				alert('Save failed. Your changes have not been lost — please try again.');
			}
		}
	}

	class LogoutCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && !editable;
		}

		async execute() {
			try {
				const api_module = await import('#app/api.remote.js');
				await api_module.logout_admin();
				editable = false;
				page_browser.close?.();
				await refreshAll();
			} catch (err) {
				alert(err instanceof Error ? err.message : 'Logout failed.');
			}
		}
	}

	const key_mapper = new KeyMapper();
	setContext('key_mapper', key_mapper);

	const app_command_context = {
		get editable() {
			return editable;
		},
		set editable(value) {
			editable = value;
		},
		get session() {
			return session;
		},
		get app_el() {
			return app_el;
		}
	};

	class BrowsePagesCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && !this.context.editable;
		}

		execute() {
			page_browser.open_navigate();
		}
	}

	class NewPageCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && !this.context.editable;
		}

		execute() {
			return goto(resolve('/new'));
		}
	}

	let is_home_page = $derived(page.url.pathname === '/');
	let duplicate_source = $derived(is_home_page ? '/' : slug);

	class DuplicatePageCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && can_edit && !editable && !!duplicate_source;
		}

		execute() {
			if (!duplicate_source) return;
			toolbar_ref?.close_page_menu();
			return goto(`${resolve('/new')}?from=${encodeURIComponent(duplicate_source)}`);
		}
	}

	class EditPageUrlCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && can_edit && !editable && !is_home_page;
		}

		execute() {
			toolbar_ref?.close_page_menu();
			page_url_dialog.open({
				document_id: session.doc.document_id,
				page_href: slug ? `/${slug}` : null
			});
		}
	}

	class PageMenuCommand extends Command {
		is_enabled() {
			return has_backend && is_admin && !editable;
		}

		execute() {
			toolbar_ref?.open_page_menu();
		}
	}

	const app_commands = {
		duplicate_page: new DuplicatePageCommand(app_command_context),
		edit_page_url: new EditPageUrlCommand(app_command_context),
		page_menu: new PageMenuCommand(app_command_context),
		new_page: new NewPageCommand(app_command_context),
		edit_document: new EditCommand(app_command_context),
		cancel_editing: new CancelCommand(app_command_context),
		save_document: new SaveCommand(app_command_context),
		logout_admin: new LogoutCommand(app_command_context),
		browse_pages: new BrowsePagesCommand(app_command_context)
	};

	const app_key_map = define_keymap({
		'ctrl+escape': [app_commands.cancel_editing],
		'meta+e,ctrl+e,ctrl+shift+e': [app_commands.edit_document],
		'ctrl+shift+n': [app_commands.new_page],
		'meta+d,ctrl+d': [app_commands.duplicate_page],
		'ctrl+shift+u': [app_commands.edit_page_url],
		'ctrl+shift+m': [app_commands.page_menu],
		'meta+p,ctrl+p': [app_commands.browse_pages],
		'meta+s,ctrl+s': [app_commands.save_document]
	});
	key_mapper.push_scope(app_key_map);

	let session = $derived.by(() => create_session(initial_doc));
	let loaded_document_id = $derived(initial_doc.document_id);

	$effect(() => {
		loaded_document_id;
		if (is_new) {
			editable = true;
		}
	});

	$effect(() => {
		return () => {
			clear_mobile_overscroll_timeout();
		};
	});
</script>

<svelte:window
	onkeydown={key_mapper.handle_keydown.bind(key_mapper)}
	onscroll={handle_mobile_overscroll_check}
	ontouchstart={handle_mobile_touchstart}
	ontouchmove={handle_mobile_overscroll_check}
	ontouchend={handle_mobile_touchend}
	ontouchcancel={handle_mobile_touchend}
/>

<div class="antialiased" bind:this={app_el}>
	<Toolbar bind:this={toolbar_ref} {session} {app_commands} {editable} {focus_canvas} />
	<Svedit {session} bind:editable bind:this={svedit_ref} path={[session.doc.document_id]} />

	{#if has_backend}
		<SaveProgressModal
			visible={save_progress_visible}
			message={save_progress_message}
			done={save_progress_done}
			progress={save_progress_percent}
		/>
	{/if}
</div>
