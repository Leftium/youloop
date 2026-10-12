import { clampClipBounds } from './clip-bounds.ts';
import type { TimelineMode } from './watch-timeline.ts';

/** The editor always passes clip; watch uses its local scope selection. */
export function playbackBounds(
	duration: number | undefined,
	a: number,
	b: number,
	scope: TimelineMode
) {
	const settled = duration !== undefined && Number.isFinite(duration) && duration > 0;
	if (settled) {
		return scope === 'video' ? { start: 0, end: duration } : clampClipBounds(a, b, duration);
	}
	// Bootstrap remains inside the supplied clip until provider duration settles.
	const start = Number.isFinite(a) ? Math.max(0, a) : 0;
	const end = Number.isFinite(b) && b > start ? b : 99999;
	return { start, end };
}

/** Preserve position inside the selected scope; enter at its beginning otherwise. */
export function scopeSwitchTarget(time: number, bounds: { start: number; end: number }) {
	return Number.isFinite(time) && time >= bounds.start && time <= bounds.end ? time : bounds.start;
}

/** Use the same boundary policy for time updates and the provider's ended event. */
export function playbackBoundaryAction(
	time: number,
	bounds: { start: number; end: number },
	loop: boolean,
	playing: boolean,
	ended = false
) {
	if (ended || time > bounds.end || (playing && time >= bounds.end)) {
		return loop ? 'repeat' : 'stop';
	}
	return time < bounds.start ? 'clamp-start' : 'continue';
}
