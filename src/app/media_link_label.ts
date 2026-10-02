export function media_link_label(alt: string | undefined, href: string, caption?: string) {
	return alt?.trim() || caption?.trim() || (href === '/' ? 'Home' : `Go to ${href}`);
}
