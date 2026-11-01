// Svelte action that adds an 'ew-revealed' class when the element scrolls into view.
// Usage: <div use:reveal>...</div>
// Optionally pass a custom threshold: <div use:reveal={{ threshold: 0.2 }}>...</div>
// Optionally pass a delay (ms): <div use:reveal={{ delay: 200 }}>...</div>

export function reveal(
	node: HTMLElement,
	options: { threshold?: number; once?: boolean; delay?: number } = {}
) {
	const { threshold = 0.1, once = true, delay = 0 } = options;

	node.classList.add('ew-reveal-hidden');

	let timeout_id: ReturnType<typeof setTimeout> | undefined;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					if (delay > 0) {
						timeout_id = setTimeout(() => {
							node.classList.remove('ew-reveal-hidden');
							node.classList.add('ew-revealed');
						}, delay);
					} else {
						node.classList.remove('ew-reveal-hidden');
						node.classList.add('ew-revealed');
					}
					if (once) {
						observer.unobserve(node);
					}
				} else if (!once) {
					clearTimeout(timeout_id);
					node.classList.remove('ew-revealed');
					node.classList.add('ew-reveal-hidden');
				}
			}
		},
		{ threshold }
	);

	observer.observe(node);

	return {
		destroy() {
			clearTimeout(timeout_id);
			observer.disconnect();
		}
	};
}
