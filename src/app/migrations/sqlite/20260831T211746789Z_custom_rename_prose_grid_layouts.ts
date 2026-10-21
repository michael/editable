export default {
	up({ replace_value }) {
		// Prose grid layouts became a matrix of box style and text alignment,
		// following the prose naming convention: an unmarked layout means
		// left-aligned text, '-centered-text' means centered text.
		// 'plain' keeps its value; old 'cards' was boxed with centered text.
		const cards_changes = replace_value('prose_grid', 'layout', 'cards', 'boxed-centered-text');

		console.log(`Renamed prose_grid layouts: ${cards_changes} cards -> boxed-centered-text`);
	}
};
