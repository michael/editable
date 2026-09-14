<script lang="ts">
	import App from '#app/components/App.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<!--
	Canonical visual recipes. Copy the classes into the element that fits the interaction.
	Keep examples explicit; adapt semantics and behavior in the consuming code.
	Colors, fonts, and corner radius come from app.css.
-->
<App {...data}>
	<main class="bg-(--background) pt-block-generous pb-16 font-sans text-(--foreground)">
		<div class="mx-auto max-w-7xl space-y-16 px-5 sm:px-7">
			<header class="space-y-3">
				<h1 class="display-2">The Editable Design System</h1>
				<p class="max-w-xl text-base leading-relaxed text-(--muted-foreground)">
					A shared starting point for Editable. Simple styles, ready to use and adapt.
				</p>
			</header>

			<section
				id="foundations"
				aria-labelledby="foundations-heading"
				class="space-y-12 lg:space-y-16"
			>
				<div class="space-y-2">
					<h2 id="foundations-heading" class="text-xl font-medium">Foundations</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Colors, fonts, and corner radii come from the shared tokens in
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>src/app.css</code
						>. These specimens follow the current token values.
					</p>
				</div>

				<div class="space-y-5 sm:space-y-7">
					<h3 class="text-sm font-medium">Colors and surfaces</h3>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						Keep each surface with its foreground color. Neutral controls use the muted surface on
						hover and a 10% foreground tint on press. Primary actions and editing actions use their
						respective accent treatments.
					</p>
					<div class="grid grid-cols-1 gap-x-5 gap-y-8 sm:gap-x-7 lg:grid-cols-3 lg:gap-y-7">
						<div class="space-y-3">
							<div
								class="flex min-h-28 items-center rounded-(--image-border-radius) border border-(--stroke) bg-(--background) p-5 body-base text-(--foreground)"
							>
								Page content
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--background</code
								>
								/
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--foreground</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex min-h-28 flex-col justify-center gap-1 rounded-(--image-border-radius) border border-(--stroke) bg-(--muted) p-5 body-base text-(--foreground)"
							>
								<p>Secondary surface</p>
								<p class="body-sm text-(--muted-foreground)">Supporting text</p>
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--muted</code
								>
								/
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--muted-foreground</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex min-h-28 items-center rounded-(--image-border-radius) border border-transparent bg-(--accent) p-5 body-base text-(--accent-foreground)"
							>
								Primary action or highlight
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--accent</code
								>
								/
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--accent-foreground</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex min-h-28 items-center rounded-(--image-border-radius) border border-transparent bg-(--editing) p-5 body-base text-(--editing-foreground)"
							>
								Active editing
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--editing</code
								>
								/
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--editing-foreground</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex min-h-28 items-center rounded-(--image-border-radius) border border-(--stroke) bg-(--editing-muted) p-5 body-base text-(--editing)"
							>
								Passive editing highlight
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--editing-muted</code
								>
								/
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--editing</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex min-h-28 flex-col justify-center gap-3 rounded-(--image-border-radius) border border-(--stroke) bg-(--background) p-5 body-base"
							>
								<p>Borders and dividers</p>
								<hr class="border-0 border-t border-(--stroke)" />
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--stroke</code
								>
							</p>
						</div>
					</div>
				</div>

				<div class="space-y-5 sm:space-y-7">
					<h3 class="text-sm font-medium">Font families</h3>
					<div class="grid grid-cols-1 gap-x-5 gap-y-8 sm:gap-x-7 lg:grid-cols-3 lg:gap-y-7">
						<div class="space-y-3">
							<p class="font-sans text-2xl">Clear words.</p>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>font-sans</code
								> · Inter
							</p>
						</div>
						<div class="space-y-3">
							<p class="font-serif text-2xl">Clear words.</p>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>font-serif</code
								> · Libertinos Serif Display
							</p>
						</div>
						<div class="space-y-3">
							<p class="font-mono text-2xl">Clear words.</p>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>font-mono</code
								> · IBM Plex Mono
							</p>
						</div>
					</div>
				</div>

				<div class="space-y-5 sm:space-y-7">
					<h3 class="text-sm font-medium">Corner radii</h3>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						Buttons and pill shells use the button radius. Popovers cap it at 1rem; their inner rows
						and pill controls subtract 4px padding and a 1px border, clamped at zero. Images use
						their own radius. Set either token to zero for square corners.
					</p>
					<!-- Static shape specimens; interactive recipes appear in the sections below. -->
					<div
						class="grid grid-cols-1 items-start gap-x-5 gap-y-8 sm:grid-cols-2 sm:gap-x-7 lg:grid-cols-4 lg:gap-y-7"
					>
						<div class="space-y-3">
							<div
								class="inline-flex min-h-11 items-center rounded-(--button-border-radius) border border-(--stroke) px-5 py-2 text-base leading-6 font-medium"
							>
								Button
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--button-border-radius</code
								>
							</p>
						</div>
						<div class="space-y-3">
							<div
								class="inline-flex rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1"
							>
								<div
									class="flex min-h-9 items-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] bg-(--muted) px-3 py-2 text-sm leading-5 font-medium"
								>
									Pill interior
								</div>
							</div>
							<p class="body-sm">Button radius with an inset interior.</p>
						</div>
						<div class="space-y-3">
							<div
								class="rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1"
							>
								<div
									class="min-h-10 rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] bg-(--muted) px-3 py-2.5 text-sm leading-5"
								>
									Popover row
								</div>
							</div>
							<p class="body-sm">Button radius capped at 1rem, with an inset row.</p>
						</div>
						<div class="space-y-3">
							<div
								class="flex aspect-video items-center justify-center rounded-(--image-border-radius) border border-(--stroke) bg-(--muted) p-5 body-sm"
							>
								Image corners
							</div>
							<p class="body-sm">
								<code
									class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
									>--image-border-radius</code
								>
							</p>
						</div>
					</div>
				</div>
			</section>

			<section id="page-limiter" aria-labelledby="page-limiter-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="page-limiter-heading" class="text-xl font-medium">Page limiter</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Center each block with <code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>mx-auto max-w-7xl</code
						>, then add
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>px-5 sm:px-7</code
						> inside it. The width limit is 80rem (1280px), including side padding: 1.25rem (20px) on
						small screens and 1.75rem (28px) from the 40rem (640px) breakpoint, at the default root font
						size.
					</p>
				</div>

				<!--
				Cancel the reference page padding so this specimen shows the actual page limiter.
				The muted surface exposes the side padding; the inner surface marks the content area.
				Full-width block backgrounds belong outside the limiter. Vertical spacing belongs to each block.
				The reference page combines width and padding on one wrapper for the same geometry.
			-->
				<div class="-mx-5 sm:-mx-7">
					<div class="mx-auto max-w-7xl bg-(--muted)">
						<div class="px-5 sm:px-7">
							<div class="border-x border-dashed border-(--stroke) bg-(--background) py-8">
								<p class="body-base">Page content aligns here.</p>
								<p class="mt-2 body-sm text-(--muted-foreground)">
									The shaded edges show the shared page padding. Resize the window to compare.
								</p>
							</div>
						</div>
					</div>
				</div>

				<pre
					class="overflow-x-auto rounded-(--image-border-radius) border border-(--stroke) bg-(--muted) p-4 text-sm leading-6"><code
						>&lt;div class="mx-auto max-w-7xl"&gt;
	&lt;div class="px-5 sm:px-7"&gt;
		Page content
	&lt;/div&gt;
&lt;/div&gt;</code
					></pre>
				<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
					Keep full-width backgrounds outside the limiter and choose vertical spacing per block.
					Narrower reading columns can sit inside this shared page width. Apply the side padding
					once so adjacent blocks line up.
				</p>
			</section>

			<section id="content-tracks" aria-labelledby="content-tracks-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="content-tracks-heading" class="text-xl font-medium">Content tracks</h2>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						A track controls how much of the page limiter a block occupies and where it sits. Prose
						and descriptive listings share narrow left, center, and right tracks, plus a wide
						layout. Alternating their positions adds variation while keeping shared alignment edges.
					</p>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						Narrow tracks use <code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>max-w-4xl</code
						>
						(56rem / 896px) inside the
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>max-w-7xl</code
						> page limiter (80rem / 1280px). These are maximum widths, not fixed proportions. Both include
						the shared side padding.
					</p>
				</div>

				<!-- Use actual track widths and padding so these diagrams respond like application blocks. -->
				<div class="space-y-6">
					<figure class="space-y-2">
						<figcaption class="body-sm">
							Narrow left · <code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>max-w-4xl</code
							>
						</figcaption>
						<div class="-mx-5 sm:-mx-7">
							<div class="mx-auto max-w-7xl bg-(--muted)">
								<div class="max-w-4xl px-5 sm:px-7">
									<div
										class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
									>
										Content starts at the left page edge.
									</div>
								</div>
							</div>
						</div>
					</figure>

					<figure class="space-y-2">
						<figcaption class="body-sm">
							Narrow center · <code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>mx-auto max-w-4xl</code
							>
						</figcaption>
						<div class="-mx-5 sm:-mx-7">
							<div class="mx-auto max-w-7xl bg-(--muted)">
								<div class="mx-auto max-w-4xl px-5 sm:px-7">
									<div
										class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
									>
										Content sits in the center of the page.
									</div>
								</div>
							</div>
						</div>
					</figure>

					<figure class="space-y-2">
						<figcaption class="body-sm">
							Narrow right · <code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>ml-auto max-w-4xl</code
							>
						</figcaption>
						<div class="-mx-5 sm:-mx-7">
							<div class="mx-auto max-w-7xl bg-(--muted)">
								<div class="ml-auto max-w-4xl px-5 sm:px-7">
									<div
										class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
									>
										Content ends at the right page edge.
									</div>
								</div>
							</div>
						</div>
					</figure>

					<figure class="space-y-2">
						<figcaption class="body-sm">Wide · use the full available content width</figcaption>
						<div class="-mx-5 sm:-mx-7">
							<div class="mx-auto max-w-7xl bg-(--muted)">
								<div class="px-5 sm:px-7">
									<div
										class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
									>
										Content spans the limiter, inside the shared side padding.
									</div>
								</div>
							</div>
						</div>
					</figure>

					<figure class="space-y-2">
						<figcaption class="body-sm">
							Two columns · descriptive listings · 50:50 after the gap
						</figcaption>
						<div class="-mx-5 sm:-mx-7">
							<div class="mx-auto max-w-7xl bg-(--muted)">
								<div class="px-5 sm:px-7">
									<div class="grid grid-cols-1 gap-x-10 gap-y-0 lg:grid-cols-2 lg:gap-x-14">
										<div
											class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
										>
											First column
										</div>
										<div
											class="border-x border-dashed border-(--stroke) bg-(--background) py-5 body-sm"
										>
											Second column
										</div>
									</div>
								</div>
							</div>
						</div>
					</figure>
				</div>
			</section>

			<section id="block-spacing" aria-labelledby="block-spacing-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="block-spacing-heading" class="text-xl font-medium">Vertical block spacing</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Generous spacing separates sections. Compact spacing pulls related blocks together. Each
						block has its own top and bottom padding, chosen independently.
					</p>
				</div>

				<ul class="max-w-prose list-disc space-y-2 pl-5 body-sm">
					<li>A standalone block has generous padding above and below.</li>
					<li>
						In a section, the first block has generous top padding and compact bottom padding.
					</li>
					<li>Middle blocks have compact padding above and below.</li>
					<li>The last block has compact top padding and generous bottom padding.</li>
					<li>A section containing just one block has generous padding above and below.</li>
				</ul>

				<div class="space-y-3">
					<h3 class="text-sm font-medium">Padding per edge</h3>
					<div class="overflow-x-auto">
						<table class="w-full max-w-3xl text-sm leading-6">
							<caption class="sr-only">Responsive generous and compact padding values</caption>
							<thead
								><tr
									><th scope="col" class="pr-6 pb-3 text-left font-medium">Viewport width</th><th
										scope="col"
										class="pr-6 pb-3 text-left font-medium">Generous</th
									><th scope="col" class="pb-3 text-left font-medium">Compact</th></tr
								></thead
							>
							<tbody
								><tr class="border-t border-(--stroke)"
									><th scope="row" class="py-3 pr-6 text-left font-normal">Below 640px</th><td
										class="py-3 pr-6">2.5rem · 40px</td
									><td class="py-3">1rem · 16px</td></tr
								>
								<tr class="border-t border-(--stroke)"
									><th scope="row" class="py-3 pr-6 text-left font-normal">640–767px</th><td
										class="py-3 pr-6">3.5rem · 56px</td
									><td class="py-3">1rem · 16px</td></tr
								>
								<tr class="border-t border-(--stroke)"
									><th scope="row" class="py-3 pr-6 text-left font-normal">768–1023px</th><td
										class="py-3 pr-6">4rem · 64px</td
									><td class="py-3">1rem · 16px</td></tr
								>
								<tr class="border-t border-(--stroke)"
									><th scope="row" class="py-3 pr-6 text-left font-normal">1024px and above</th><td
										class="py-3 pr-6">7rem · 112px</td
									><td class="py-3">1.75rem · 28px</td></tr
								></tbody
							>
						</table>
					</div>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Pixel equivalents assume the default 16px root font size. Adjacent padding adds up: two
						compact edges create a 32px gap, or 56px from 1024px. Two generous edges create an 80px,
						112px, 128px, or 224px gap across the same viewport ranges.
					</p>
				</div>

				<!--
				Reference values mirror Prose.svelte's section boundary rules and the current spacing scale.
				Explicit height bands visualize padding at its actual responsive size without extra gaps.
				The specimen content has its own inset to make the block boundaries visible.
			-->
				<div class="grid items-start gap-10 md:grid-cols-2">
					<div class="space-y-4">
						<h3 class="text-sm font-medium">Standalone block</h3>
						<div class="border border-(--stroke)">
							<div>
								<div
									class="flex h-10 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) sm:h-14 md:h-16 lg:h-28"
								>
									Generous
								</div>
								<div class="border-y border-dashed border-(--stroke) px-5 py-4 sm:px-7">
									<p class="body-base">Independent content</p>
								</div>
								<div
									class="flex h-10 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) sm:h-14 md:h-16 lg:h-28"
								>
									Generous
								</div>
							</div>
						</div>
					</div>
					<div class="space-y-4">
						<h3 class="text-sm font-medium">Three blocks in one section</h3>
						<div class="divide-y divide-(--stroke) border border-(--stroke)">
							<div>
								<div
									class="flex h-10 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) sm:h-14 md:h-16 lg:h-28"
								>
									Generous
								</div>
								<div class="border-y border-dashed border-(--stroke) px-5 py-4 sm:px-7">
									<p class="body-base">First block</p>
								</div>
								<div
									class="flex h-4 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) lg:h-7"
								>
									Compact
								</div>
							</div>
							<div>
								<div
									class="flex h-4 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) lg:h-7"
								>
									Compact
								</div>
								<div class="border-y border-dashed border-(--stroke) px-5 py-4 sm:px-7">
									<p class="body-base">Middle block</p>
								</div>
								<div
									class="flex h-4 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) lg:h-7"
								>
									Compact
								</div>
							</div>
							<div>
								<div
									class="flex h-4 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) lg:h-7"
								>
									Compact
								</div>
								<div class="border-y border-dashed border-(--stroke) px-5 py-4 sm:px-7">
									<p class="body-base">Last block</p>
								</div>
								<div
									class="flex h-10 items-center justify-center bg-(--muted) text-xs leading-4 text-(--muted-foreground) sm:h-14 md:h-16 lg:h-28"
								>
									Generous
								</div>
							</div>
						</div>
					</div>
				</div>
				<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
					Shaded bands show the padding at its actual size. Resize the window to compare the scale.
					Spacing within a block, such as the gap between a heading and a paragraph, is a separate
					choice.
				</p>
				<div id="block-spacing-api" class="space-y-6">
					<div class="space-y-2">
						<h3 class="text-sm font-medium">Sample block implementation</h3>
						<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
							A top-level block receives its section context through <code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>mark</code
							>, aliased to
							<code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>section</code
							>. As in Prose.svelte, the block derives its top and bottom padding from that context.
							No extra padding props are needed.
						</p>
					</div>
					<div class="space-y-3">
						<h4 class="text-sm text-(--muted-foreground)">Sample prose block</h4>
						<pre
							class="overflow-x-auto rounded-(--image-border-radius) border border-(--stroke) bg-(--muted) p-4 text-sm leading-6"><code
								>&lt;script lang="ts"&gt;
	import &#123; Node, NodeArrayProperty &#125; from 'svedit';
	import type &#123; DocumentPath, NodeArrayAttachmentContext &#125; from 'svedit';

	let &#123;
		path,
		mark: section = null
	&#125;: &#123;
		path: DocumentPath;
		mark?: NodeArrayAttachmentContext | null;
	&#125; = $props();

	let padding_top_generous = $derived(!section || section.is_start);
	let padding_bottom_generous = $derived(!section || section.is_end);
&lt;/script&gt;

&lt;Node &#123;path&#125; class="bg-(--background) text-(--foreground)"&gt;
	&lt;div class="mx-auto max-w-7xl"&gt;
		&lt;div class=&#123;[
			'px-5 sm:px-7',
			padding_top_generous ? 'pt-block-generous' : 'pt-block-compact',
			padding_bottom_generous ? 'pb-block-generous' : 'pb-block-compact'
		]&#125;&gt;
			&lt;NodeArrayProperty
				path=&#123;[...path, 'body']&#125;
				class="flex flex-col gap-5 sm:gap-7"
			/&gt;
		&lt;/div&gt;
	&lt;/div&gt;
&lt;/Node&gt;</code
							></pre>
					</div>
					<ul class="max-w-prose list-disc space-y-2 pl-5 body-sm">
						<li>No section mark: both edges are generous.</li>
						<li>
							<code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>section.is_start</code
							>: the top edge is generous.
						</li>
						<li>
							<code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>section.is_end</code
							>: the bottom edge is generous.
						</li>
						<li>
							<code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>section.is_middle</code
							>: both edges are compact; the two boundary checks already cover this case.
						</li>
						<li>A one-block section is both the start and the end, so both edges are generous.</li>
					</ul>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						The app uses shared utilities in <code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>src/app.css</code
						>
						for the default rhythm:
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>pt-block-generous</code
						>,
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>pt-block-compact</code
						>, and their
						<code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>pb-</code
						> equivalents. They apply the values above to existing elements without adding a wrapper component.
					</p>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						For a custom rhythm, replace the default utility on that edge with explicit responsive
						classes, such as <code
							class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
							>pt-8 lg:pt-16</code
						>. Avoid combining a default utility with overrides on the same edge. Keep deliberate
						exceptions local: flush and full-bleed figures have no vertical padding.
					</p>
				</div>
			</section>

			<section id="typography" aria-labelledby="typography-heading" class="space-y-10">
				<div class="space-y-2">
					<h2 id="typography-heading" class="text-xl font-medium">Typography</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						A shared scale for headings and body text.
					</p>
				</div>

				<!--
				Use the typography utilities directly; their Tailwind definitions live in app.css.
				Display sizes grow at lg. Weight, line height, and tracking belong to the utility.
				Choose the heading element for the document hierarchy, independently of its visual size.
				These specimens are all h3 because they sit within the Typography section.
			-->
				<div class="space-y-10">
					<div id="type-display-1" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">display-1</p>
						<h3 class="display-1">Make room for what matters.</h3>
					</div>
					<div id="type-display-2" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">display-2</p>
						<h3 class="display-2">Make room for what matters.</h3>
					</div>
					<div id="type-display-3" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">display-3</p>
						<h3 class="display-3">Make room for what matters.</h3>
					</div>
					<div id="type-display-4" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">display-4</p>
						<h3 class="display-4">Make room for what matters.</h3>
					</div>
					<div id="type-display-5" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">display-5</p>
						<h3 class="display-5">Make room for what matters.</h3>
					</div>
				</div>

				<!--
				Body sizes share regular weight and 1.5 line height. Body-xl also grows at lg.
				Reading width and spacing are layout choices, kept outside the typography utilities.
				Use the same copy at each size to compare rhythm and wrapping.
			-->
				<div class="space-y-10">
					<div id="type-body-xl" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">body-xl</p>
						<p class="max-w-prose body-xl">
							Good design makes everyday things easier to understand. Clear words, comfortable
							spacing, and a thoughtful hierarchy help people find what they need and decide what to
							do next.
						</p>
					</div>
					<div id="type-body-lg" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">body-lg</p>
						<p class="max-w-prose body-lg">
							Good design makes everyday things easier to understand. Clear words, comfortable
							spacing, and a thoughtful hierarchy help people find what they need and decide what to
							do next.
						</p>
					</div>
					<div id="type-body-base" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">body-base</p>
						<p class="max-w-prose body-base">
							Good design makes everyday things easier to understand. Clear words, comfortable
							spacing, and a thoughtful hierarchy help people find what they need and decide what to
							do next.
						</p>
					</div>
					<div id="type-body-sm" class="space-y-3">
						<p class="text-sm text-(--muted-foreground)">body-sm</p>
						<p class="max-w-prose body-sm">
							Good design makes everyday things easier to understand. Clear words, comfortable
							spacing, and a thoughtful hierarchy help people find what they need and decide what to
							do next.
						</p>
					</div>
				</div>
			</section>

			<section id="formatting" aria-labelledby="formatting-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="formatting-heading" class="text-xl font-medium">Inline formatting</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						Emphasis and detail within the flow of a sentence.
					</p>
				</div>

				<!--
				Based on Emphasis, Strong, Link, Code, and Highlight in src/app/components.
				Formatting inherits the surrounding size and color unless its meaning calls for a change.
				Inline formatting styles are mutually exclusive: never nest or combine them on the same text.
				Use semantic HTML and keep marks inline so sentences can wrap naturally.
				Application components still own document references and editor behavior.
			-->
				<div class="space-y-8">
					<div id="format-emphasis" class="space-y-3">
						<h3 class="text-sm text-(--muted-foreground)">Emphasis · em</h3>
						<!-- Italic adds emphasis without introducing another weight or color. -->
						<p class="max-w-prose body-base">
							Start with what people <em class="italic">actually need</em>.
						</p>
					</div>

					<div id="format-strong" class="space-y-3">
						<h3 class="text-sm text-(--muted-foreground)">Bold · strong</h3>
						<!-- Semibold distinguishes important text within regular body copy. -->
						<p class="max-w-prose body-base">
							Keep the <strong class="font-semibold">most important information</strong> easy to find.
						</p>
					</div>

					<div id="format-link" class="space-y-3">
						<h3 class="text-sm text-(--muted-foreground)">Link · a</h3>
						<!--
						Prose links have no padding, minimum size, or flex display.
						Inherit the surrounding text color and retain a visible underline.
						Scale underline thickness and offset with the font size using em units.
						At 16px, thickness is 1px normally and 2px on hover or press.
						Use the shared editing outline for keyboard focus.
					-->
						<p class="max-w-prose body-base">
							Explore the
							<a
								href="#typography"
								class="underline decoration-[0.0625em] underline-offset-[0.125em] hover:decoration-[0.125em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:decoration-[0.125em]"
								>typography styles</a
							>
							to see how the scale works.
						</p>
					</div>

					<div id="format-code" class="space-y-3">
						<h3 class="text-sm text-(--muted-foreground)">Code · code</h3>
						<!--
						Scale code relative to its surrounding text, with a foreground-derived surface.
						Code and highlight share 0.25em horizontal and 0.125em vertical padding.
						Follow the button radius, capped at 0.25em to keep inline corners subtle.
						Clone the background and padding across wrapped lines. Long identifiers may break.
					-->
						<p class="max-w-prose body-base">
							Use <code
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--foreground)/8 box-decoration-clone px-[0.25em] py-[0.125em] font-mono text-[0.9em] font-normal wrap-anywhere"
								>font-medium</code
							>
							for button labels.
						</p>
					</div>

					<div id="format-highlight" class="space-y-3">
						<h3 class="text-sm text-(--muted-foreground)">Highlight · mark</h3>
						<!--
						Use the existing accent pair rather than fixed yellow or the editor selection color.
						Match code padding and the button radius capped at 0.25em, including on wrapped lines.
						Highlight is a standalone formatting style.
					-->
						<p class="max-w-prose body-base">
							Highlight <mark
								class="rounded-[min(var(--button-border-radius),0.25em)] bg-(--accent) box-decoration-clone px-[0.25em] py-[0.125em] text-(--accent-foreground)"
								>the part worth remembering</mark
							>, not the whole paragraph.
						</p>
					</div>
				</div>
			</section>
		</div>
		<section id="carousel" aria-labelledby="carousel-heading" class="@container my-16 space-y-8">
			<div class="mx-auto max-w-7xl space-y-2 px-5 sm:px-7">
				<h2 id="carousel-heading" class="text-xl font-medium">Card carousel</h2>
				<p class="body-sm text-(--muted-foreground)">
					A full-width scroll area with gutters aligned to the page content. Cards keep their size
					and remain visible beyond the page limiter when there is space. Inner gutters leave room
					for editor edge gaps. The track includes both gutters, so the first and last cards align
					with the page limiter at either end. Matching scroll padding preserves snap alignment.
					Navigation sits below, aligned to the end. These buttons illustrate disabled and enabled
					states; the gallery updates them as you scroll.
				</p>
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Scrollable region needs keyboard access.) -->
			<div
				tabindex="0"
				role="region"
				aria-label="Card carousel example"
				class="[scrollbar-none] focus-visible:-out line-offset-2 relative snap-x snap-mandatory scroll-px-(--ew-carousel-inset) overflow-x-auto overscroll-x-contain [--ew-carousel-card-width:calc(var(--ew-carousel-content)*0.85)] [--ew-carousel-content:calc(min(100cqw,80rem)-2*var(--ew-carousel-gutter))] [--ew-carousel-gutter:1.25rem] [--ew-carousel-inset:max(var(--ew-carousel-gutter),calc((100cqw-80rem)/2+var(--ew-carousel-gutter)))] focus-visible:outline-2 focus-visible:outline-(--editing) sm:[--ew-carousel-gutter:1.75rem] md:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-1.75rem)/2)] xl:[--ew-carousel-card-width:calc((var(--ew-carousel-content)-3.5rem)/3)] [&::-webkit-scrollbar]:hidden"
			>
				<div
					class="grid w-max min-w-full auto-cols-(--ew-carousel-card-width) grid-flow-col gap-5 px-(--ew-carousel-inset) sm:gap-7"
				>
					<article class="min-w-0 snap-start">
						<div class="aspect-4/3 rounded-(--image-border-radius) bg-(--muted)"></div>
						<h3 class="pt-4 body-base">First card</h3>
						<p class="pt-1 body-base text-(--muted-foreground)">
							Existing card proportions and typography.
						</p>
					</article>
					<article class="min-w-0 snap-start">
						<div class="aspect-4/3 rounded-(--image-border-radius) bg-(--muted)"></div>
						<h3 class="pt-4 body-base">Second card</h3>
						<p class="pt-1 body-base text-(--muted-foreground)">
							Cards stay in one horizontal row.
						</p>
					</article>
					<article class="min-w-0 snap-start">
						<div class="aspect-4/3 rounded-(--image-border-radius) bg-(--muted)"></div>
						<h3 class="pt-4 body-base">Third card</h3>
						<p class="pt-1 body-base text-(--muted-foreground)">Scroll to explore more items.</p>
					</article>
					<article class="min-w-0 snap-start">
						<div class="aspect-4/3 rounded-(--image-border-radius) bg-(--muted)"></div>
						<h3 class="pt-4 body-base">Fourth card</h3>
						<p class="pt-1 body-base text-(--muted-foreground)">
							The carousel stops at the final card.
						</p>
					</article>
				</div>
			</div>
			<div class="mx-auto flex max-w-7xl justify-end gap-3 px-5 sm:px-7">
				<button
					type="button"
					aria-label="Previous gallery item (appearance example)"
					disabled
					class="inline-flex size-11 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					><svg
						class="size-5 rtl:rotate-180"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"><path d="m14 7-5 5 5 5" /></svg
					></button
				>
				<button
					type="button"
					aria-label="Next gallery item (appearance example)"
					class="inline-flex size-11 shrink-0 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
					><svg
						class="size-5 rtl:rotate-180"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"><path d="m10 7 5 5-5 5" /></svg
					></button
				>
			</div>
		</section>
		<div class="mx-auto max-w-7xl space-y-16 px-5 sm:px-7">
			<section id="buttons" aria-labelledby="buttons-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="buttons-heading" class="text-xl font-medium">Buttons</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						Standard size. Hover, press, or tab to explore the states.
					</p>
				</div>

				<!--
				Shared typography: 1rem text and 1.5 line height, with a 2.75rem minimum height.
				Primary and secondary share horizontal padding and a reserved 1px border.
				Standalone links align with surrounding text instead of inheriting button padding.
				Use an offset outline for keyboard focus, with no shadows or movement.
			-->
				<div class="grid gap-10 sm:grid-cols-3 sm:gap-8">
					<div id="button-primary" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Primary</h3>
						<!-- Main action. Mix in sRGB for visible feedback even with black accents; keep text opaque. -->
						<button
							type="button"
							class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-center text-base leading-6 font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)] disabled:cursor-default disabled:opacity-40"
						>
							Continue
						</button>
					</div>

					<div id="button-secondary" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Secondary</h3>
						<!-- Supporting action. Use the shared stroke border, muted hover surface, and foreground tint on press. -->
						<button
							type="button"
							class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent px-5 py-2 text-center text-base leading-6 font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							Continue
						</button>
					</div>

					<div id="button-link" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Link</h3>
						<!--
						Standalone navigation: no horizontal padding or border, so text aligns with its surroundings.
						Keep the 44px minimum height and a 24px minimum width, increased to 44px for coarse pointers.
						Short labels stay start-aligned.
						Inline links within prose need a separate recipe without this vertical sizing.
						Target guidance: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
					This local destination keeps the specimen usable without adding application behavior.
					For an action with this appearance, use a button and handle its disabled state explicitly.
					-->
						<a
							href="#buttons"
							class="inline-flex min-h-11 max-w-full min-w-6 items-center justify-start py-2.5 text-start text-base leading-6 font-medium wrap-anywhere text-(--foreground) underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:decoration-2 pointer-coarse:min-w-11"
						>
							Continue
						</a>
					</div>
				</div>
			</section>

			<section id="buttons-small" aria-labelledby="buttons-small-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="buttons-small-heading" class="text-xl font-medium">Small buttons</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						For navigation and compact layouts. Small buttons keep a 36px minimum height on all
						devices.
					</p>
				</div>

				<!--
				Compact geometry: 0.875rem text, 1.25rem line height, and a 2.25rem minimum height.
				Keep medium weight at both sizes; emphasis comes from the variant, not heavier text.
				Keep the same dimensions for mouse and touch. Let content wrap and increase the height.
				These are explicit recipes, with the same colors and states as the standard size.
			-->
				<div class="grid gap-10 sm:grid-cols-3 sm:gap-8">
					<div id="button-primary-small" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Primary</h3>
						<!-- Main action. Mix in sRGB for visible feedback even with black accents; keep text opaque. -->
						<button
							type="button"
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)] disabled:cursor-default disabled:opacity-40"
						>
							Continue
						</button>
					</div>

					<div id="button-secondary-small" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Secondary</h3>
						<!-- Supporting action. Use the shared stroke border, muted hover surface, and foreground tint on press. -->
						<button
							type="button"
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							Continue
						</button>
					</div>

					<div id="button-link-small" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Link</h3>
						<!-- Standalone link: preserve start alignment and omit horizontal padding at both sizes. -->
						<a
							href="#buttons"
							class="inline-flex min-h-9 max-w-full min-w-6 items-center justify-start py-2 text-start text-sm leading-5 font-medium wrap-anywhere text-(--foreground) underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:decoration-2"
						>
							Continue
						</a>
					</div>
				</div>
			</section>

			<section id="buttons-disabled" aria-labelledby="buttons-disabled-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="buttons-disabled-heading" class="text-xl font-medium">Disabled buttons</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Buttons and pill controls use 40% opacity with the default cursor. Native disabled
						buttons skip keyboard focus and suppress hover and press feedback. Menu rows instead use
						muted text to keep unavailable actions legible.
					</p>
				</div>
				<!-- Copy the enabled recipe unchanged and add the native disabled attribute. -->
				<div class="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
					<div class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Primary</h3>
						<button
							type="button"
							disabled
							class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-5 py-2 text-center text-base leading-6 font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)] disabled:cursor-default disabled:opacity-40"
							>Continue</button
						>
					</div>
					<div class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Secondary</h3>
						<button
							type="button"
							disabled
							class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent px-5 py-2 text-center text-base leading-6 font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
							>Continue</button
						>
					</div>
					<div class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Small primary</h3>
						<button
							type="button"
							disabled
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)] disabled:cursor-default disabled:opacity-40"
							>Continue</button
						>
					</div>
					<div class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Small secondary</h3>
						<button
							type="button"
							disabled
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-transparent px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
							>Continue</button
						>
					</div>
				</div>
				<div class="space-y-4">
					<h3 class="text-sm text-(--muted-foreground)">Editing pill</h3>
					<div
						class="inline-flex max-w-full items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
					>
						<button
							type="button"
							disabled
							class="inline-flex min-h-9 max-w-full min-w-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent px-8 py-2 text-sm leading-5 font-medium wrap-anywhere text-(--editing) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--editing-muted) enabled:active:bg-(--editing)/15 disabled:cursor-default disabled:opacity-40"
							>Create link</button
						>
					</div>
				</div>
			</section>

			<section
				id="descriptive-listing"
				aria-labelledby="descriptive-listing-heading"
				class="space-y-8"
			>
				<div class="space-y-2">
					<h2 id="descriptive-listing-heading" class="text-xl font-medium">Descriptive listing</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						A linked row with a title, description, and optional metadata. Hover or press anywhere
						on the row to strengthen the title underline; keyboard focus outlines the whole row. A
						plain listing uses the same recipe with the description omitted.
					</p>
				</div>
				<!-- Keep the row as one link. Description and metadata have no underline of their own. -->
				<div class="max-w-4xl">
					<div class="border-b border-(--stroke)">
						<a
							href="#typography"
							class="group/listing-link block py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) sm:py-2 md:py-3"
						>
							<div class="flex items-center justify-between gap-6">
								<div class="min-w-2/3 flex-1">
									<p
										class="body-base underline decoration-[0.0625em] underline-offset-[0.125em] group-hover/listing-link:decoration-[0.125em] group-active/listing-link:decoration-[0.125em]"
									>
										Typography
									</p>
									<p class="pt-1 body-base text-balance text-(--muted-foreground)">
										A shared scale for headings and body text.
									</p>
								</div>
								<div class="min-w-0 self-center text-right">
									<p class="pt-1 body-base text-(--muted-foreground)">9 styles</p>
								</div>
							</div>
						</a>
					</div>
					<div class="border-b border-(--stroke)">
						<a
							href="#buttons"
							class="group/listing-link block py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) sm:py-2 md:py-3"
						>
							<div class="flex items-center justify-between gap-6">
								<div class="min-w-2/3 flex-1">
									<p
										class="body-base underline decoration-[0.0625em] underline-offset-[0.125em] group-hover/listing-link:decoration-[0.125em] group-active/listing-link:decoration-[0.125em]"
									>
										Buttons
									</p>
									<p class="pt-1 body-base text-balance text-(--muted-foreground)">
										Primary, secondary, and link treatments for common actions.
									</p>
								</div>
							</div>
						</a>
					</div>
				</div>
			</section>

			<section id="boxed-prose" aria-labelledby="boxed-prose-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="boxed-prose-heading" class="text-xl font-medium">Boxed items</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Boxed items use a muted surface. Their secondary buttons use the background color at
						rest and the muted color on hover. This styling applies only to secondary buttons inside
						the box.
					</p>
				</div>
				<div
					class="max-w-sm rounded-(--image-border-radius) border border-(--stroke) bg-(--muted) px-8 py-10"
				>
					<div class="flex flex-col items-center gap-5 text-center text-balance sm:gap-7">
						<h3 class="display-5">Make it your own</h3>
						<p class="body-base">Start with the shared styles and adapt them to your site.</p>
						<a
							href="#buttons"
							class="inline-flex min-h-11 max-w-full min-w-11 items-center justify-center rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-5 py-2 text-center text-base leading-6 font-medium wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10"
							>Explore buttons</a
						>
					</div>
				</div>
			</section>

			<section id="navigation" aria-labelledby="navigation-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="navigation-heading" class="text-xl font-medium">Navigation</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						A placeholder logo, main links, and small primary and secondary buttons.
					</p>
				</div>

				<!--
				Equal outer columns keep the main links centered on wide screens.
				On smaller screens, the links wrap onto their own row beneath the brand and actions.
				Example links point to local specimens; consuming pages provide their own destinations.
				Action buttons reuse the small button recipes and do not execute application commands.
			-->
				<nav
					aria-label="Example main navigation"
					class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-4 py-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
				>
					<a
						href="#navigation"
						class="inline-flex min-h-9 min-w-0 flex-wrap items-center gap-2 justify-self-start text-xl font-medium tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
					>
						<svg class="size-8 shrink-0" viewBox="0 0 32 32" fill="none" aria-hidden="true">
							<circle cx="16" cy="16" r="16" class="fill-(--foreground)" />
							<path
								d="M11 10H21M11 16H19M11 22H21"
								class="stroke-(--background)"
								stroke-width="3"
								stroke-linecap="round"
							/>
						</svg>
						Editable
					</a>
					<ul
						class="col-span-2 row-start-2 flex flex-wrap items-center gap-x-6 gap-y-1 md:col-span-1 md:col-start-2 md:row-start-1"
					>
						<li>
							<a
								href="#typography"
								class="inline-flex min-h-9 items-center py-1.5 text-sm leading-5 text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
								>Product</a
							>
						</li>
						<li>
							<a
								href="#buttons-small"
								class="inline-flex min-h-9 items-center py-1.5 text-sm leading-5 text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
								>Quickstart</a
							>
						</li>
						<li>
							<a
								href="#formatting"
								class="inline-flex min-h-9 items-center py-1.5 text-sm leading-5 text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
								>Manual</a
							>
						</li>
						<li>
							<a
								href="#pills"
								class="inline-flex min-h-9 items-center py-1.5 text-sm leading-5 text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
								>Contact</a
							>
						</li>
					</ul>
					<div
						class="col-start-2 row-start-1 flex flex-wrap items-center justify-end gap-2 md:col-start-3"
					>
						<button
							type="button"
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center rounded-(--button-border-radius) border border-transparent bg-(--accent) px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--accent-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_20%)] enabled:active:bg-[color-mix(in_srgb,var(--accent),var(--accent-foreground)_30%)] disabled:cursor-default disabled:opacity-40"
							>Try</button
						>
						<button
							type="button"
							class="inline-flex min-h-9 max-w-full min-w-9 items-center justify-center gap-1.5 rounded-(--button-border-radius) border border-(--stroke) bg-transparent px-3 py-1.5 text-center text-sm leading-5 font-medium wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							Install
							<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M12 3V16M7 11L12 16L17 11M5 21H19"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</button>
					</div>
				</nav>
				<div id="navigation-mobile" class="space-y-4">
					<h3 class="text-sm font-medium">Mobile navigation controls</h3>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						The application switches to a menu on small screens. Use an opaque page background,
						these icon buttons, and larger navigation links. Controls share the 2px focus outline
						and offset, with 44px touch targets. Opening and dismissal belong to the application.
					</p>
					<div class="flex items-center gap-2">
						<button
							type="button"
							aria-label="Open menu"
							class="inline-flex size-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"
								><path
									d="M4 8h16M4 16h16"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="square"
									stroke-linejoin="miter"
								/></svg
							>
						</button>
						<button
							type="button"
							aria-label="Close menu"
							class="inline-flex size-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							<svg class="size-6" viewBox="0 0 24 24" fill="none" aria-hidden="true"
								><path
									d="M6 18L18 6M6 6l12 12"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-linecap="square"
									stroke-linejoin="miter"
								/></svg
							>
						</button>
					</div>
					<nav aria-label="Example mobile navigation" class="flex flex-col gap-1">
						<a
							href="#typography"
							class="flex min-h-11 items-center py-2 text-3xl leading-tight font-normal wrap-anywhere text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
							>Product</a
						>
						<a
							href="#buttons-small"
							class="flex min-h-11 items-center py-2 text-3xl leading-tight font-normal wrap-anywhere text-(--foreground) underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:underline"
							>Quickstart</a
						>
					</nav>
				</div>
			</section>

			<section id="pills" aria-labelledby="pills-heading" class="space-y-10">
				<div class="space-y-2">
					<h2 id="pills-heading" class="text-xl font-medium">Editor pills</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						Compact surfaces for tools, actions, and previews.
					</p>
				</div>
				<!--
Shared pill shell: solid background, stroke border, token-based rounding, 4px padding and 4px gaps.
The registered --button-border-radius resolves to one inherited length, including em values.
Shell radius uses that length; inner radius subtracts padding plus border, clamped at zero.
No shadows, transparency, blur, or movement. The shell is a surface, not a clickable control.
Controls are 36px tall, or 44px for coarse pointers. Labels use 14px medium text.
Reuse the editor's existing SVG paths. Icons use currentColor and retain their native stroke weight.
Focus belongs to each control: 2px editing outline, 2px offset. Keep shell overflow visible.
These are visual specimens with native focus and pointer states; they do not execute editor commands.
Use a group here; production toolbar keyboard behavior belongs to the consuming component.
-->
				<div class="space-y-12">
					<div id="pill-toolbar" class="space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Toolbar</h3>
						<div
							role="group"
							aria-label="Page tools"
							class="inline-flex max-w-full items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
						>
							<button
								type="button"
								aria-label="New page"
								title="New page"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><path d="M12 5V19M5 12H19" stroke="currentColor" /></svg
								></button
							><button
								type="button"
								aria-label="Browse pages"
								title="Browse pages"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><rect x="4.5" y="4.5" width="6" height="6" rx="1" stroke="currentColor" /><rect
										x="13.5"
										y="4.5"
										width="6"
										height="6"
										rx="1"
										stroke="currentColor"
									/><rect x="4.5" y="13.5" width="6" height="6" rx="1" stroke="currentColor" /><rect
										x="13.5"
										y="13.5"
										width="6"
										height="6"
										rx="1"
										stroke="currentColor"
									/></svg
								></button
							><button
								type="button"
								aria-label="Edit page"
								title="Edit page"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><path
										d="M4.5 19.5L5.25 15.25L15.75 4.75C16.7165 3.7835 18.2835 3.7835 19.25 4.75C20.2165 5.7165 20.2165 7.2835 19.25 8.25L8.75 18.75L4.5 19.5ZM14 6.5L17.5 10"
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								></button
							><button
								type="button"
								aria-label="More page actions"
								title="More page actions"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><circle cx="6" cy="12" r="1" fill="currentColor" /><circle
										cx="12"
										cy="12"
										r="1"
										fill="currentColor"
									/><circle cx="18" cy="12" r="1" fill="currentColor" /></svg
								></button
							>
						</div>
					</div>
					<div id="pill-inline-action" class="space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Inline call to action</h3>
						<!-- A single editing action gets wider label padding, while retaining the shared shell and height. -->
						<div
							class="inline-flex max-w-full items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
						>
							<button
								type="button"
								class="inline-flex min-h-9 max-w-full min-w-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent px-8 py-2 text-sm leading-5 font-medium wrap-anywhere text-(--editing) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--editing-muted) enabled:active:bg-(--editing)/15 disabled:cursor-default disabled:opacity-40"
								>Create link</button
							>
						</div>
					</div>
					<div id="pill-variant-selector" class="space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Variant selector and select parent</h3>
						<!-- The divider separates two actions. Only the selector shrinks; its status remains secondary text. -->
						<div
							role="group"
							aria-label="Selection tools"
							class="inline-flex max-w-full items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
						>
							<button
								type="button"
								aria-label="Select parent"
								title="Select parent"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><path
										d="M6.5 12.5C6.5 15.8137 9.18629 18.5 12.5 18.5C15.8137 18.5 18.5 15.8137 18.5 12.5C18.5 9.18629 15.8137 6.5 12.5 6.5M4.48278 4.48206L13 12.9993M9.44657 4.48173L4.48278 4.48206V9.44727"
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								></button
							><span aria-hidden="true" class="mx-1 h-5 w-px shrink-0 bg-(--stroke)"></span><button
								type="button"
								aria-label="Choose gallery variant, mixed selection"
								class="inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><span class="min-w-0 truncate max-sm:min-w-24"
									>Gallery <span class="font-mono text-xs font-normal text-(--muted-foreground)"
										>(mixed)</span
									></span
								><svg
									class="size-4 shrink-0 text-(--muted-foreground)"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
									><path
										d="M7 10L12 15L17 10"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								></button
							>
						</div>
					</div>
					<div id="pill-link-preview" class="space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Link preview</h3>
						<!--
The preview link and its actions are siblings, never nested interactive elements.
The thumbnail slot shows an initials fallback; an actual thumbnail uses size-9 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] object-cover.
Only the preview title truncates. Keep edit and remove controls visible at narrow widths.
The local href is a specimen destination. Production links retain their own destination and target.
-->
						<div
							role="group"
							aria-label="Link preview"
							class="inline-flex max-w-full items-center gap-1 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
						>
							<a
								href="#pills"
								class="inline-flex min-h-9 max-w-70 min-w-0 items-center gap-2 rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] pr-3 text-sm leading-5 font-medium hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10"
								><span
									aria-hidden="true"
									class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] bg-(--muted) text-xs font-medium text-(--muted-foreground)"
									>EW</span
								><span class="min-w-0 truncate">Why Editable?</span></a
							><button
								type="button"
								aria-label="Edit link"
								title="Edit link"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><path
										d="M4.5 19.5L5.25 15.25L15.75 4.75C16.7165 3.7835 18.2835 3.7835 19.25 4.75C20.2165 5.7165 20.2165 7.2835 19.25 8.25L8.75 18.75L4.5 19.5ZM14 6.5L17.5 10"
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								></button
							><button
								type="button"
								aria-label="Remove link"
								title="Remove link"
								class="inline-flex size-9 shrink-0 items-center justify-center rounded-[max(0px,calc(var(--button-border-radius)-0.25rem-1px))] border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
								><svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
									><path
										d="M5.5 7.5H18.5M9.5 4.5H14.5L15.5 7.5M7 7.5L7.75 19.5H16.25L17 7.5M10 10.5V16M14 10.5V16"
										stroke="currentColor"
										stroke-linecap="round"
										stroke-linejoin="round"
									/></svg
								></button
							>
						</div>
					</div>
				</div>
			</section>
			<section id="editor-forms" aria-labelledby="editor-forms-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="editor-forms-heading" class="text-xl font-medium">Editor forms</h2>
					<p class="max-w-prose text-sm leading-relaxed text-(--muted-foreground)">
						Link and media prompts use an opaque surface with 4px padding, no shadow, and the button
						radius capped at 1rem. Fields and actions subtract the padding and border from that
						radius. Text inputs and textareas use 16px text and an editing-color border on focus.
					</p>
				</div>
				<!-- A static form surface; submission and dialog behavior belong to the application. -->
				<div
					class="flex w-80 max-w-full flex-col gap-1 rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1 text-(--foreground)"
				>
					<input
						type="url"
						aria-label="Example link URL"
						value="https://example.com"
						class="min-h-9 w-full min-w-0 rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border border-(--stroke) bg-(--background) px-3 py-1 text-base leading-6 text-(--foreground) outline-none focus:border-(--editing) focus:ring-0"
					/>
					<div class="flex flex-wrap items-center justify-between gap-2 pl-3">
						<label class="flex min-h-9 cursor-pointer items-center gap-2">
							<input
								type="checkbox"
								class="size-4 shrink-0 cursor-pointer rounded-[min(0.25rem,var(--button-border-radius))] border-(--stroke)! bg-(--muted)! text-(--editing) ring-0 checked:border-transparent! checked:bg-(--editing)! focus:ring-0 focus:ring-offset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing)"
							/>
							<span class="text-sm text-(--foreground)">Open in new tab</span>
						</label>
						<button
							type="button"
							class="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2 text-sm leading-5 font-medium text-(--editing) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--editing-muted) enabled:active:bg-(--editing)/15 disabled:cursor-default disabled:opacity-40"
							>Update</button
						>
					</div>
				</div>
			</section>

			<section id="page-browser" aria-labelledby="page-browser-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="page-browser-heading" class="text-xl font-medium">Page browser</h2>
					<p class="max-w-prose body-sm text-(--muted-foreground)">
						A muted editing fill marks the result Enter will open. Only keyboard-focused rows get a
						ring, drawn inside the row to keep tree guides and adjacent rows clear. Search focus
						uses a thin editing-color border. Action menus reuse the list popover recipe.
					</p>
				</div>
				<div class="max-w-xl space-y-4 p-1">
					<label
						class="flex min-h-11 items-center gap-2 rounded-(--button-border-radius) border border-(--stroke) bg-(--background) px-3 focus-within:border-(--editing)"
					>
						<svg
							class="size-5 shrink-0 text-(--muted-foreground)"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<circle cx="10" cy="10" r="6" stroke="currentColor" />
							<path d="M15 15L21 21" stroke="currentColor" />
						</svg>
						<input
							type="search"
							aria-label="Example page search"
							placeholder="Search pages"
							class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base leading-6 text-(--foreground) outline-none placeholder:text-(--muted-foreground) focus:ring-0"
						/>
					</label>
					<div
						class="flex min-h-11 items-center gap-2 rounded-(--button-border-radius) bg-(--editing-muted) px-1"
					>
						<a
							href="#page-browser"
							class="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-(--button-border-radius) text-sm leading-5 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--editing)"
						>
							<span
								aria-hidden="true"
								class="size-9 shrink-0 rounded-(--button-border-radius) bg-(--muted)"
							></span>
							<span class="truncate">Why Editable?</span>
						</a>
						<button
							type="button"
							aria-label="Example page actions"
							class="inline-flex size-9 shrink-0 items-center justify-center rounded-(--button-border-radius) border-0 bg-transparent p-0 text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--background) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:opacity-40"
						>
							<svg class="size-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle
									cx="18"
									cy="12"
									r="1"
								/>
							</svg>
						</button>
					</div>
				</div>
			</section>

			<section id="popovers" aria-labelledby="popovers-heading" class="space-y-8">
				<div class="space-y-2">
					<h2 id="popovers-heading" class="text-xl font-medium">List popovers</h2>
					<p class="text-sm leading-relaxed text-(--muted-foreground)">
						Compact lists with a shared surface and aligned rows.
					</p>
				</div>
				<!--
List surfaces cap --button-border-radius at 1rem to leave room for the first and last rows.
Item radius = outer radius minus 4px padding and 1px border, clamped at zero.
Use the same shape for every row. A zero button radius makes the surface and all rows square.
Keep 4px padding around the list for the 2px focus outline plus 2px offset.
Use opaque background, stroke border, and no shadow. Rows use regular text and 40px minimum height.
These are permanently visible style references. Opening, dismissal, positioning, collision handling,
and menu keyboard behavior belong to the application; do not add menu roles without that behavior.
-->
				<div class="grid items-start gap-10 md:grid-cols-2">
					<div id="popover-context-menu" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Context menu</h3>
						<!-- Disabled actions remain legible and suppress pointer, hover, and active treatments. -->
						<div
							role="group"
							aria-label="Page actions"
							class="w-56 max-w-full rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1"
						>
							<button
								type="button"
								class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
								>Duplicate page</button
							><button
								type="button"
								disabled
								class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
								>Edit URL</button
							><button
								type="button"
								disabled
								class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
								>Delete page</button
							>
							<hr class="my-1 border-0 border-t border-(--stroke)" />
							<button
								type="button"
								class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) enabled:cursor-pointer enabled:hover:bg-(--muted) enabled:active:bg-(--foreground)/10 disabled:cursor-default disabled:text-(--muted-foreground) pointer-coarse:min-h-11"
								>Logout</button
							>
						</div>
					</div>
					<div id="popover-table-of-contents" class="min-w-0 space-y-4">
						<h3 class="text-sm text-(--muted-foreground)">Table of contents</h3>
						<!--
Use navigation links rather than menu actions. Labels wrap instead of truncating.
The shell itself scrolls, with padding for focus clearance; do not add another rounded clipping layer.
These destinations are real sections on this reference page. Application contents use page headings.
-->
						<nav
							aria-label="Design system contents"
							class="max-h-80 w-96 max-w-full overflow-y-auto overscroll-contain rounded-[min(1rem,var(--button-border-radius))] border border-(--stroke) bg-(--background) p-1"
						>
							<ul class="list-none">
								<li>
									<a
										href="#foundations"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Foundations</a
									>
								</li>
								<li>
									<a
										href="#typography"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Typography</a
									>
								</li>
								<li>
									<a
										href="#formatting"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Inline formatting</a
									>
								</li>
								<li>
									<a
										href="#buttons"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Standard buttons</a
									>
								</li>
								<li>
									<a
										href="#buttons-small"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Small buttons</a
									>
								</li>
								<li>
									<a
										href="#buttons-disabled"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Disabled buttons</a
									>
								</li>
								<li>
									<a
										href="#descriptive-listing"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Descriptive listing</a
									>
								</li>
								<li>
									<a
										href="#pills"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>Editor pills</a
									>
								</li>
								<li>
									<a
										href="#popovers"
										class="flex min-h-10 w-full items-center rounded-[max(0px,calc(min(1rem,var(--button-border-radius))-0.25rem-1px))] border-0 bg-transparent px-3 py-2.5 text-start text-sm leading-5 font-normal wrap-anywhere text-(--foreground) hover:bg-(--muted) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--editing) active:bg-(--foreground)/10 pointer-coarse:min-h-11"
										>List popovers</a
									>
								</li>
							</ul>
						</nav>
					</div>
				</div>
			</section>
		</div>
	</main>
</App>
