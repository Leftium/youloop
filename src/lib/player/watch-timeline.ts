export type TimelineMode = 'video' | 'clip';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Unknown/degenerate ranges fall back to a finite, noninteractive VIDEO track. */
export function timelineRange(duration: number | undefined, a: number, b: number, time: number) {
	const valid = duration !== undefined && Number.isFinite(duration) && duration > 0;
	const total = valid ? duration : 0;
	const start = clamp(Number.isFinite(a) ? a : 0, 0, total);
	const end = clamp(Number.isFinite(b) ? b : total, start, total);
	const length = end - start;
	const restricted = valid && length > 0 && (start > 0 || end < total);
	const absolute = clamp(Number.isFinite(time) ? time : 0, 0, total);
	const elapsed = clamp(absolute - start, 0, length);
	return {
		valid,
		total,
		start,
		end,
		length,
		restricted,
		absolute,
		elapsed,
		videoProgress: total ? absolute / total : 0,
		clipProgress: length ? elapsed / length : 0,
		selectionStart: total ? start / total : 0,
		selectionWidth: total ? length / total : 0,
		leftTail: restricted && start > 0,
		rightTail: restricted && end < total
	};
}

/** Call choose only with settled duration. Reset on each loaded source, never on range updates. */
export function createTimelineMode() {
	let decided = false;
	let mode: TimelineMode = 'video';
	return {
		reset() {
			decided = false;
			mode = 'video';
		},
		choose(duration: number | undefined, a: number, b: number): TimelineMode {
			const range = timelineRange(duration, a, b, 0);
			if (!decided && range.valid) {
				mode = range.restricted && range.length / range.total < 0.25 ? 'clip' : 'video';
				decided = true;
			}
			return mode;
		},
		toggle(): TimelineMode {
			decided = true;
			mode = mode === 'video' ? 'clip' : 'video';
			return mode;
		}
	};
}
