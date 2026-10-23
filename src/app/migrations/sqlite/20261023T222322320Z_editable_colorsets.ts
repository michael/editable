import type { Migration, MigrationContext } from '#lib/server/migrations.js';

// Sections and prose grid boxes choose a color set from app.css instead of a color layout.
// Muted sections become color set 2 and accent sections color set 3; accent boxes become
// boxes in color set 3.
export default {
	up({ update }: MigrationContext) {
		const section_colorsets: Record<string, string> = {
			muted: 'colorset-2',
			accent: 'colorset-3'
		};
		update('section', (node) => {
			node.colorset = section_colorsets[String(node.layout)] ?? 'inherit';
			delete node.layout;
		});
		update('prose_grid', (node) => {
			const layout = String(node.layout);
			node.colorset = layout.startsWith('boxed-accent') ? 'colorset-3' : 'inherit';
			node.layout = layout.replace('boxed-accent', 'boxed');
		});
	}
} satisfies Migration;
