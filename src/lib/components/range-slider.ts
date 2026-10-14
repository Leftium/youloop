// Adapted from Leftium/vee-next at 6bbd34c1a8f85cbfed304157c8112a15490e71d3.
export type NumericRange = { start: number; end: number };
export type RangeEdge = 'start' | 'end';
export type ThumbInteraction = 'clamp' | 'swap' | 'push-pull';
export type StepRounding = 'nearest' | 'floor';

function clampRangeValue(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function normalizeRange(range: NumericRange, min: number, max: number): NumericRange {
	// Imported invalid ranges must remain repairable without replacing the
	// untouched endpoint. Interaction enforces ordering once a thumb moves.
	return {
		start: clampRangeValue(range.start, min, max),
		end: clampRangeValue(range.end, min, max)
	};
}

export function rangeValuePercent(value: number, min: number, max: number): number {
	return max > min ? ((clampRangeValue(value, min, max) - min) / (max - min)) * 100 : 0;
}

export function rangeValueAtPosition(
	position: number,
	width: number,
	min: number,
	max: number
): number {
	return width > 0
		? clampRangeValue(Number((min + (position / width) * (max - min)).toFixed(10)), min, max)
		: min;
}

function snapRangeValue(
	candidate: number,
	min: number,
	max: number,
	step?: number,
	rounding: StepRounding = 'nearest'
): number {
	const bounded = clampRangeValue(Number(candidate.toFixed(10)), min, max);
	if (!step || !Number.isFinite(step) || step <= 0) return bounded;
	const grid = clampRangeValue(
		min + (rounding === 'floor' ? Math.floor : Math.round)((bounded - min) / step) * step,
		min,
		max
	);
	// Bounds are extra positions, not part of the regular grid.
	return rounding === 'nearest' && max - bounded < Math.abs(grid - bounded) ? max : grid;
}

// Navigate the ordered set of grid positions plus exact bounds. Arithmetic from
// a fractional bound would skip its adjacent grid value when rounded afterward.
export function stepRangeValue(
	value: number,
	direction: -1 | 1,
	min: number,
	max: number,
	step: number,
	count = 1,
	mode: 'grid' | 'relative' = 'grid'
): number {
	if (!Number.isFinite(step) || step <= 0) return clampRangeValue(value, min, max);
	if (mode === 'relative')
		return clampRangeValue(Number((value + direction * step * count).toFixed(10)), min, max);
	const position = (clampRangeValue(value, min, max) - min) / step;
	const nearest = Math.round(position);
	const aligned =
		Math.abs(position - nearest) <= Number.EPSILON * Math.max(1, Math.abs(position)) * 4
			? nearest
			: position;
	const index = direction === 1 ? Math.floor(aligned) + count : Math.ceil(aligned) - count;
	return clampRangeValue(min + index * step, min, max);
}

// Clamp is one policy; both input methods share applyThumbInteraction below.
export function moveRangeThumb(
	range: NumericRange,
	edge: RangeEdge,
	candidate: number,
	min: number,
	max: number,
	step?: number
): NumericRange {
	const current = normalizeRange(range, min, max);
	const value = snapRangeValue(candidate, min, max, step);
	return edge === 'start'
		? { ...current, start: clampRangeValue(value, min, current.end) }
		: { ...current, end: clampRangeValue(value, current.start, max) };
}

export function applyThumbInteraction(
	range: NumericRange,
	edge: RangeEdge,
	candidate: number,
	min: number,
	max: number,
	interaction: ThumbInteraction,
	step?: number,
	original = range,
	rounding: StepRounding = 'nearest'
): { range: NumericRange; edge: RangeEdge } {
	const current = normalizeRange(range, min, max);
	const value = snapRangeValue(candidate, min, max, step, rounding);
	if (interaction === 'swap') {
		if (edge === 'start' && value > current.end)
			return { range: { start: current.end, end: value }, edge: 'end' };
		if (edge === 'end' && value < current.start)
			return { range: { start: value, end: current.start }, edge: 'start' };
	}
	if (interaction === 'push-pull') {
		if (edge === 'start') {
			const length = Math.max(0, original.end - original.start);
			return {
				range: {
					start: value,
					end:
						rounding === 'floor'
							? snapRangeValue(candidate + length, min, max, step, rounding)
							: clampRangeValue(value + length, min, max)
				},
				edge
			};
		}
		return { range: { start: Math.min(current.start, value), end: value }, edge };
	}
	return { range: moveRangeThumb(current, edge, value, min, max), edge };
}

// Preserve the stationary endpoint where possible, including after role swaps.
export function ensureRangeSpan(
	range: NumericRange,
	edge: RangeEdge,
	min: number,
	max: number,
	minimumSpan: number
): NumericRange {
	const span = Math.min(Math.max(0, minimumSpan), max - min);
	if (range.end - range.start >= span) return range;
	if (edge === 'start') {
		const start = Math.max(min, range.end - span);
		return { start, end: Math.max(range.end, start + span) };
	}
	const end = Math.min(max, range.start + span);
	return { start: Math.min(range.start, end - span), end };
}
