const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// Tips retain their times. Bases shift against the track and the midpoint between tips;
// where there is room, height and base form an equilateral triangle.
export function rangeTriangles(width: number, height: number, start: number, end: number) {
	const a = clamp(start * width, 0, width);
	const b = clamp(end * width, a, width);
	const divider = (a + b) / 2;
	const idealBase = (2 * height) / Math.sqrt(3);
	function marker(tip: number, min: number, max: number) {
		const base = Math.min(idealBase, max - min);
		const baseLeft = clamp(tip - base / 2, min, max - base);
		const baseRight = baseLeft + base;
		const left = Math.min(tip, baseLeft);
		return {
			left,
			width: Math.max(tip, baseRight) - left,
			tip: tip - left,
			baseLeft: baseLeft - left,
			baseRight: baseRight - left,
			label: (tip + baseLeft + baseRight) / 3 - left
		};
	}
	return {
		start: marker(a, 0, divider),
		end: marker(b, divider, width)
	};
}
