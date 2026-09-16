<script lang="ts">
	import { ASSET_BASE } from '#app/config.js';

	import type { PreviewMediaNode } from '#app/page_metadata.js';

	let { node, editable = false }: { node: PreviewMediaNode; editable?: boolean } = $props();

	// Determine if src is a blob URL (unsaved), a saved asset id, or empty
	let is_blob = $derived(node.src?.startsWith('blob:'));
	let is_saved = $derived(node.src && !is_blob);

	// Resolve the display URL and the saved video's derived poster URL.
	let display_src = $derived(is_blob ? node.src : is_saved ? `${ASSET_BASE}/${node.src}` : '');
	let poster_src = $derived(
		is_saved ? `${ASSET_BASE}/${node.src.slice(0, node.src.lastIndexOf('.'))}/poster.webp` : ''
	);

	// Apply scale to video (same as Image.svelte)
	let video_style = $derived(`
		object-position: ${node.focal_point_x * 100}% ${node.focal_point_y * 100}%;
		transform: scale(${node.scale});
		transform-origin: ${node.focal_point_x * 100}% ${node.focal_point_y * 100}%;
		object-fit: ${node.object_fit};
	`);

	let video_el = $state<HTMLVideoElement | null>(null);
	let is_fullscreen = $state(false);

	// Autoplay handling — try multiple strategies since the element may be
	// mounted late (after hydration) and readiness events may have already fired.
	$effect(() => {
		const v = video_el;
		if (!v || !display_src) return;

		let cancelled = false;

		function try_play() {
			if (cancelled || !v) return;
			v.muted = true;
			const p = v.play();
			if (p) p.catch(() => {});
		}

		if (v.readyState >= 2) {
			try_play();
		} else {
			v.addEventListener('canplay', try_play, { once: true });
			v.addEventListener('loadeddata', try_play, { once: true });
		}

		const timer = setTimeout(try_play, 100);

		return () => {
			cancelled = true;
			clearTimeout(timer);
			v.removeEventListener('canplay', try_play);
			v.removeEventListener('loadeddata', try_play);
		};
	});

	function enter_fullscreen(e: MouseEvent) {
		// Only allow fullscreen in published view (not editable)
		if (editable) return;
		e.preventDefault();
		const v = video_el;
		if (!v || is_fullscreen) return;

		// Enable controls and unmute for fullscreen experience
		v.controls = true;
		v.muted = false;

		if (v.requestFullscreen) {
			v.requestFullscreen();
		} else if ((v as any).webkitEnterFullscreen) {
			(v as any).webkitEnterFullscreen();
		} else if ((v as any).webkitRequestFullscreen) {
			(v as any).webkitRequestFullscreen();
		}
	}

	// Listen for fullscreen exit events and restore inline state.
	$effect(() => {
		const v = video_el;
		if (!v) return;

		function resume_inline() {
			if (!v) return;
			is_fullscreen = false;
			v.controls = false;
			v.muted = true;
			const p = v.play();
			if (p) p.catch(() => {});

			// iOS pauses the video again ~200-400ms after the initial play succeeds,
			// so retry once after 500ms
			setTimeout(() => {
				if (!v || !v.paused) return;
				v.muted = true;
				const p2 = v.play();
				if (p2) p2.catch(() => {});
			}, 500);
		}

		// Standard Fullscreen API (Chrome, Firefox, Safari desktop)
		function handle_fullscreen_change() {
			if (!v) return;
			const fs = document.fullscreenElement || (document as any).webkitFullscreenElement;
			if (fs === v) {
				is_fullscreen = true;
			} else if (!fs) {
				resume_inline();
			}
		}

		// iOS Safari fires this on the video element itself
		function handle_webkit_end_fullscreen() {
			resume_inline();
		}

		// Track fullscreen entry on iOS
		function handle_webkit_begin_fullscreen() {
			is_fullscreen = true;
		}

		v.addEventListener('webkitbeginfullscreen', handle_webkit_begin_fullscreen);
		document.addEventListener('fullscreenchange', handle_fullscreen_change);
		document.addEventListener('webkitfullscreenchange', handle_fullscreen_change);
		v.addEventListener('webkitendfullscreen', handle_webkit_end_fullscreen);

		return () => {
			document.removeEventListener('fullscreenchange', handle_fullscreen_change);
			document.removeEventListener('webkitfullscreenchange', handle_fullscreen_change);
			v.removeEventListener('webkitbeginfullscreen', handle_webkit_begin_fullscreen);
			v.removeEventListener('webkitendfullscreen', handle_webkit_end_fullscreen);
		};
	});
</script>

{#if display_src}
	<video
		bind:this={video_el}
		contenteditable="false"
		src={display_src}
		poster={poster_src || undefined}
		aria-label={node.alt}
		width={node.width}
		height={node.height}
		style={video_style}
		autoplay
		muted
		loop
		playsinline
		disablepictureinpicture
		preload="auto"
		onclick={enter_fullscreen}
		class="block size-full"
		class:cursor-zoom-in={!editable && !is_fullscreen}
	></video>
{/if}
