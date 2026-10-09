interface Bounds {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

// Coordinates are relative to the visible player, with safe-area padding already removed.
export function placeWatchControls(
	safe: Bounds,
	video: Bounds,
	groups: { time: number; actions: number; height: number }
) {
	const gap = 12;
	const height = groups.height;
	const minimumWidth = groups.time + groups.actions + 6;
	const row = (left: number, top: number, right: number, mode: string) => ({
		left,
		top,
		width: Math.max(0, right - left),
		height,
		mode
	});
	const bottomTop = Math.max(safe.top, Math.min(video.bottom - 14 - height, safe.bottom - height));
	if (
		video.left - gap - safe.left >= groups.time &&
		safe.right - video.right - gap >= groups.actions &&
		safe.bottom - safe.top >= height
	) {
		return row(
			video.left - gap - groups.time,
			bottomTop,
			video.right + gap + groups.actions,
			'sides'
		);
	}
	if (safe.right - safe.left >= minimumWidth) {
		const width = Math.min(
			safe.right - safe.left,
			Math.max(video.right - video.left, minimumWidth)
		);
		const left = Math.max(
			safe.left,
			Math.min((video.left + video.right - width) / 2, safe.right - width)
		);
		if (safe.bottom - video.bottom >= gap + height) {
			return row(left, video.bottom + gap, left + width, 'below');
		}
		if (video.top - safe.top >= gap + height) {
			return row(left, video.top - gap - height, left + width, 'above');
		}
	}
	// A very narrow portrait canvas may not hold even the compact row. Keep its
	// buttons reachable across the surrounding player without changing the picture.
	const width = Math.min(
		safe.right - safe.left,
		Math.max(video.right - video.left - 24, minimumWidth)
	);
	const left = Math.max(
		safe.left,
		Math.min((video.left + video.right - width) / 2, safe.right - width)
	);
	return row(left, bottomTop, left + width, 'video');
}

export function placeWatchTitle(
	safe: Bounds,
	video: Bounds,
	controls: { left: number; top: number; width: number; height: number },
	measureHeight: number | ((width: number) => number)
) {
	const gap = 12;
	const width = Math.min(420, safe.right - safe.left);
	const centered = Math.max(
		safe.left,
		Math.min((video.left + video.right - width) / 2, safe.right - width)
	);
	const wideWidth = Math.max(0, safe.right - safe.left);
	const candidates = [
		{ left: centered, top: video.top - gap, width, mode: 'above' },
		{ left: safe.left, top: video.top - gap, width: wideWidth, mode: 'above' },
		{ left: centered, top: video.bottom + gap, width, mode: 'below' },
		{ left: safe.left, top: video.bottom + gap, width: wideWidth, mode: 'below' },
		{ left: centered, top: controls.top + controls.height + gap, width, mode: 'below' },
		{
			left: Math.max(safe.left, video.left - gap - width),
			top: Math.max(safe.top, video.top + gap),
			width: Math.min(width, video.left - gap - safe.left),
			mode: 'left'
		},
		{
			left: video.right + gap,
			top: Math.max(safe.top, video.top + gap),
			width: Math.min(width, safe.right - video.right - gap),
			mode: 'right'
		}
	];
	for (const candidate of candidates) {
		if (candidate.width < Math.min(180, width)) continue;
		const height =
			typeof measureHeight === 'number' ? measureHeight : measureHeight(candidate.width);
		if (candidate.mode === 'above') candidate.top -= height;
		const right = candidate.left + candidate.width;
		const bottom = candidate.top + height;
		const outsidePicture =
			right <= video.left ||
			candidate.left >= video.right ||
			bottom <= video.top ||
			candidate.top >= video.bottom;
		const clearOfControls =
			right <= controls.left ||
			candidate.left >= controls.left + controls.width ||
			bottom + gap <= controls.top ||
			candidate.top >= controls.top + controls.height + gap;
		if (
			candidate.width >= Math.min(180, width) &&
			candidate.top >= safe.top &&
			bottom <= safe.bottom &&
			candidate.left >= safe.left &&
			right <= safe.right &&
			outsidePicture &&
			clearOfControls
		) {
			return { ...candidate, maxHeight: safe.bottom - candidate.top };
		}
	}
	const top = Math.max(safe.top, video.top + gap);
	return {
		left: Math.max(safe.left, video.left + gap),
		top,
		width: Math.max(
			0,
			Math.min(safe.right, video.right - gap) - Math.max(safe.left, video.left + gap)
		),
		maxHeight: Math.max(0, Math.min(safe.bottom, controls.top - gap) - top),
		mode: 'video'
	};
}
