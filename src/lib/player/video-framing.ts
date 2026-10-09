// The Video.js YouTube iframe is intentionally very tall: source content scales
// with its width. Choosing this width determines whether the source is contained
// in or covers the current visible canvas, without changing the iframe height.
export function calculateFrameVideoWidth(
	frameWidth: number,
	frameHeight: number,
	sourceAspectRatio: number,
	fill: boolean
): number | null {
	if (
		!Number.isFinite(frameWidth) ||
		!Number.isFinite(frameHeight) ||
		!Number.isFinite(sourceAspectRatio) ||
		frameWidth <= 0 ||
		frameHeight <= 0 ||
		sourceAspectRatio <= 0
	) {
		return null;
	}
	const widthToMatchHeight = frameHeight * sourceAspectRatio;
	return fill ? Math.max(frameWidth, widthToMatchHeight) : Math.min(frameWidth, widthToMatchHeight);
}
