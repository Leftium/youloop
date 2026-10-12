/** Provider duration is authoritative; keep a nonempty playable range after clamping. */
export function clampClipBounds(start: number, end: number, duration: number) {
	const boundedEnd = end > 0 ? Math.min(end, duration) : Math.min(1 / 30, duration);
	return {
		start: Math.max(0, start < boundedEnd ? start : boundedEnd - Math.min(1 / 30, boundedEnd)),
		end: boundedEnd
	};
}
