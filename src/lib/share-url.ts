/** Negative seconds are offsets from video end; undefined flags retain defaults. */
export interface ShareUrlState {
	videoId: string;
	start?: number;
	end?: number;
	once?: boolean;
	mute?: boolean;
	mirror?: boolean;
	speed?: number;
	vertical?: boolean;
	fill?: boolean;
}

interface ShareUrlError {
	parameter: string;
	code: 'invalid' | 'duplicate';
}

export type ShareUrlResult =
	{ ok: true; value: ShareUrlState } | { ok: false; errors: ShareUrlError[] };

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const decimalPattern = /^\d+(?:\.\d+)?$/;
const signedDecimalPattern = /^-?\d+(?:\.\d+)?$/;
const flags = ['once', 'mute', 'vertical', 'fill', 'mirror'] as const;
const recognized = ['v', 't', 'a', 'b', 'speed', 'orientation', 'fit', ...flags];

/**
 * Validate and copy state, removing start=0, disabled once/mute/mirror, and speed=1 defaults.
 * False vertical/fill values remain explicit overrides. No duration is
 * available here: the integration must validate bounds against the loaded video.
 * Speed accepts continuous multipliers from 0.25 to 2; provider support is separate.
 */
export function normalizeShareUrl(state: ShareUrlState): ShareUrlResult {
	const errors: ShareUrlError[] = [];
	const invalid = (parameter: string) => errors.push({ parameter, code: 'invalid' });
	if (typeof state.videoId !== 'string' || !videoIdPattern.test(state.videoId)) invalid('videoId');
	for (const key of ['start', 'end'] as const) {
		const value = state[key];
		if (value !== undefined && !Number.isFinite(value)) invalid(key);
	}
	// Mixed origins need provider duration before their order can be validated.
	const startIsRelative = (state.start ?? 0) < 0;
	const endIsRelative = (state.end ?? 0) < 0;
	if (
		state.end !== undefined &&
		endIsRelative === startIsRelative &&
		state.end <= (state.start ?? 0)
	)
		invalid('end');
	if (
		state.speed !== undefined &&
		(!Number.isFinite(state.speed) || state.speed < 0.25 || state.speed > 2)
	)
		invalid('speed');
	for (const key of flags) {
		if (state[key] !== undefined && typeof state[key] !== 'boolean') invalid(key);
	}
	if (errors.length) return { ok: false, errors };
	const value: ShareUrlState = { videoId: state.videoId };
	if (state.start !== undefined && state.start !== 0) value.start = state.start;
	if (state.end !== undefined) value.end = state.end;
	if (state.once) value.once = true;
	if (state.speed !== undefined && state.speed !== 1) value.speed = state.speed;
	for (const key of ['mute', 'mirror'] as const) {
		if (state[key]) value[key] = true;
	}
	for (const key of ['vertical', 'fill'] as const) {
		if (state[key] !== undefined) value[key] = state[key];
	}
	return { ok: true, value };
}

/**
 * Watch routes use /ID[/START~END]; editor / and legacy /s retain query bounds.
 * Duplicate recognized keys fail, including shadowed aliases. Malformed selected
 * values fail the whole parse. Unknown query keys and fragments are ignored.
 * Legacy b=0/99999 mean video end; explicit range endpoints remain literal.
 */
export function parseShareUrl(input: string | URL): ShareUrlResult {
	let url: URL;
	try {
		if (typeof input === 'string' && !input.startsWith('/') && !/^https?:\/\//i.test(input)) {
			return { ok: false, errors: [{ parameter: 'url', code: 'invalid' }] };
		}
		url = new URL(input, 'https://youloop.invalid');
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
	} catch {
		return { ok: false, errors: [{ parameter: 'url', code: 'invalid' }] };
	}
	const params = url.searchParams;
	const errors: ShareUrlError[] = [];
	const invalid = (parameter: string) => errors.push({ parameter, code: 'invalid' });
	for (const key of recognized) {
		if (params.getAll(key).length > 1) errors.push({ parameter: key, code: 'duplicate' });
	}
	if (errors.length) return { ok: false, errors };

	const editor = ['/', '/s'].includes(url.pathname);
	let segments: string[];
	try {
		segments = url.pathname.slice(1).split('/').map(decodeURIComponent);
	} catch {
		return { ok: false, errors: [{ parameter: 'videoId', code: 'invalid' }] };
	}
	const state: ShareUrlState = { videoId: editor ? (params.get('v') ?? '') : segments[0] };
	const seconds = (raw: string, key: string, signed = false): number | undefined => {
		const value = Number(raw);
		if (
			!(signed ? signedDecimalPattern : decimalPattern).test(raw) ||
			!Number.isFinite(value) ||
			(value === 0 && /[1-9]/.test(raw))
		) {
			invalid(key);
			return undefined;
		}
		return value;
	};
	const parseRange = (raw: string, key: string, legacy = false) => {
		const match = legacy
			? /^(\d+(?:\.\d+)?)?[-:](\d+(?:\.\d+)?)?$/.exec(raw)
			: /^(-?\d+(?:\.\d+)?)?(?:~(-?\d+(?:\.\d+)?)?)?$/.exec(raw);
		if (!match || (!legacy && !match[1] && !match[2])) invalid(key);
		else {
			if (match[1]) state.start = seconds(match[1], key, !legacy);
			if (match[2]) state.end = seconds(match[2], key, !legacy);
		}
	};
	if (!editor) {
		if (segments.length > 2) invalid('range');
		if (segments.length === 2) parseRange(segments[1], 'range');
		// Never discard obsolete clip queries on watch routes.
		for (const key of ['t', 'a', 'b']) if (params.has(key)) invalid(key);
	} else if (params.has('t')) {
		const raw = params.get('t')!;
		// Root editor keeps the old positive-only grammar. Signed intent uses ~.
		parseRange(raw, 't', !raw.includes('~'));
	} else {
		if (params.has('a')) state.start = seconds(params.get('a')!, 'a');
		if (params.has('b')) {
			const end = seconds(params.get('b')!, 'b');
			if (end !== 0 && end !== 99999) state.end = end;
		}
	}
	for (const key of flags) {
		if (!params.has(key)) continue;
		const raw = params.get(key);
		if (raw === '' || raw === '1') state[key] = true;
		else if (raw === '0') state[key] = false;
		else invalid(key);
	}
	if (params.has('speed')) state.speed = seconds(params.get('speed')!, 'speed');
	if (!params.has('vertical') && params.has('orientation')) {
		const raw = params.get('orientation');
		if (raw === 'portrait' || raw === 'landscape') state.vertical = raw === 'portrait';
		else invalid('orientation');
	}
	if (!params.has('fill') && params.has('fit')) {
		const raw = params.get('fit');
		if (raw === 'cover' || raw === 'contain') state.fill = raw === 'cover';
		else invalid('fit');
	}
	if (errors.length) return { ok: false, errors };
	return normalizeShareUrl(state);
}

// Number.toString uses exponents for small/large numbers; the URL grammar uses decimals.
export function decimal(value: number): string {
	if (value < 0) return `-${decimal(-value)}`;
	const [mantissa, exponent] = String(value).split('e');
	if (exponent === undefined) return mantissa;
	const [whole, fraction = ''] = mantissa.split('.');
	const digits = whole + fraction;
	const point = whole.length + Number(exponent);
	if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
	if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
	return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

export type TimestampPolicy = 'preserve' | 'shortest' | 'from-start' | 'mixed' | 'from-end';

export type GeneratedBounds = Partial<Record<'start' | 'end', boolean>>;

/** Convert only settled, valid bounds. Preserve keeps even clamped incoming expressions. */
export function formatShareBounds(
	state: ShareUrlState,
	duration: number | undefined,
	policy: TimestampPolicy,
	generated: GeneratedBounds = {}
): ShareUrlState | undefined {
	if (duration === undefined) return undefined;
	const range = resolveClipRange(state, duration);
	if (!range.ok || !normalizeShareUrl(state).ok) return undefined;
	// Cap endpoint movement at 5 ms (less than a third of a frame at 60 fps),
	// or 5% of a short clip. Keep extra precision when hundredths cannot do that.
	const tolerance = Math.min(0.005, (range.end - range.start) / 20);
	// This is the URL-only precision boundary. Authored/imported high precision
	// survives conversions too; playback and editor state never receive these values.
	const readable = (value: number | undefined, endpoint: 'start' | 'end') => {
		const original = state[endpoint];
		const authoredPrecision =
			original !== undefined && (decimal(original).split('.')[1]?.length ?? 0) > 2;
		if (value === undefined || (!generated[endpoint] && (value === original || authoredPrecision)))
			return value;
		const position = (expression: number) =>
			Math.max(
				0,
				Math.min(duration, expression < 0 ? subtractSeconds(duration, -expression) : expression)
			);
		const before = position(value);
		for (const places of [0, 1, 2]) {
			const rounded: number = Number(value.toFixed(places));
			if (Math.abs(subtractSeconds(value, rounded)) > tolerance) continue;
			if (value < 0 !== rounded < 0 || (value === 0) !== (rounded === 0)) continue;
			const after = position(rounded);
			// Exact/clamped boundaries keep their expression for future durations.
			if ((before === 0 || before === duration) && rounded !== value) continue;
			if ((before === 0) !== (after === 0) || (before === duration) !== (after === duration))
				continue;
			return rounded;
		}
		return value;
	};
	const finish = (start: number | undefined, end: number | undefined) => {
		const exact = { ...state, start, end };
		const rounded = { ...state, start: readable(start, 'start'), end: readable(end, 'end') };
		// Sub-hundredth clips can collapse after rounding. Keep the selected format
		// at full precision rather than expanding the clip or emitting an invalid URL.
		return normalizeShareUrl(rounded).ok && resolveClipRange(rounded, duration).ok
			? rounded
			: exact;
	};
	if (policy === 'preserve') return finish(state.start, state.end);
	// Decimal subtraction avoids binary artifacts such as 600 - 593.2 = 6.7999999999999545.
	const relative = (value: number) => subtractSeconds(value, duration);
	const shortest = (positive: number, original: number | undefined, end = false) => {
		const negative = relative(positive);
		if (!end && positive === 0 && (original ?? 0) < 0) return negative;
		if (negative === 0) return end && original === undefined ? undefined : positive;
		const endpoint = end ? 'end' : 'start';
		const difference =
			decimal(readable(positive, endpoint)!).length - decimal(readable(negative, endpoint)!).length;
		return difference > 0 || (difference === 0 && (original ?? 0) < 0) ? negative : positive;
	};
	const start =
		policy === 'shortest'
			? shortest(range.start, state.start)
			: policy === 'from-end'
				? relative(range.start)
				: range.start;
	const end =
		policy === 'shortest'
			? shortest(range.end, state.end, true)
			: policy === 'from-start'
				? range.end
				: range.end === duration
					? undefined
					: relative(range.end);
	return finish(start, end);
}

/** Subtract decimal seconds without manufacturing extra fractional digits. */
export function subtractSeconds(value: number, other: number): number {
	const a = decimal(value);
	const b = decimal(other);
	const places = Math.max(a.split('.')[1]?.length ?? 0, b.split('.')[1]?.length ?? 0);
	const integer = (text: string) =>
		BigInt(text.replace('.', '') + '0'.repeat(places - (text.split('.')[1]?.length ?? 0)));
	const result = integer(a) - integer(b);
	const digits = String(result < 0n ? -result : result).padStart(places + 1, '0');
	return Number(
		`${result < 0n ? '-' : ''}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`
	);
}

function validatedState(state: ShareUrlState): ShareUrlState {
	const result = normalizeShareUrl(state);
	if (!result.ok) {
		throw new RangeError(
			`Invalid share URL state: ${result.errors.map((e) => e.parameter).join(', ')}`
		);
	}
	return result.value;
}

function rangeSegment(value: ShareUrlState): string {
	const start = value.start === undefined ? '' : decimal(value.start);
	return value.end === undefined ? start : `${start}~${decimal(value.end)}`;
}

function optionQuery(value: ShareUrlState): string[] {
	const query: string[] = [];
	for (const key of ['once', 'mute'] as const) {
		if (value[key] !== undefined) query.push(value[key] ? key : `${key}=0`);
	}
	if (value.speed !== undefined) query.push(`speed=${decimal(value.speed)}`);
	for (const key of ['vertical', 'fill'] as const) {
		if (value[key] !== undefined) query.push(value[key] ? key : `${key}=0`);
	}
	if (value.mirror) query.push('mirror');
	return query;
}

/** Return a root-relative watch URL, retaining duration-relative expressions. */
export function serializeShareUrl(state: ShareUrlState): string {
	const value = validatedState(state);
	const range = rangeSegment(value);
	const query = optionQuery(value);
	return `/${value.videoId}${range ? `/${range}` : ''}${query.length ? `?${query.join('&')}` : ''}`;
}

/** Editor intent stays at root; ~ distinguishes signed starts from legacy t=-END. */
export function serializeEditorUrl(state: ShareUrlState): string {
	const value = validatedState(state);
	let range = rangeSegment(value);
	if (range && value.end === undefined) range += '~';
	const query = [`v=${value.videoId}`, ...(range ? [`t=${range}`] : []), ...optionQuery(value)];
	return `/?${query.join('&')}`;
}

export type ResolvedClipRange = { ok: true; start: number; end: number } | { ok: false };

/** Clamp to the video without swapping or expanding a collapsed/reversed range. */
export function resolveClipRange(
	state: Pick<ShareUrlState, 'start' | 'end'>,
	duration: number
): ResolvedClipRange {
	if (
		!Number.isFinite(duration) ||
		duration <= 0 ||
		[state.start, state.end].some((value) => value !== undefined && !Number.isFinite(value))
	)
		return { ok: false };
	const resolve = (value: number) =>
		Math.max(0, Math.min(duration, value < 0 ? subtractSeconds(duration, -value) : value));
	const start = resolve(state.start ?? 0);
	const end = state.end === undefined ? duration : resolve(state.end);
	return Number.isFinite(start) && Number.isFinite(end) && end > start
		? { ok: true, start, end }
		: { ok: false };
}

/** The player supplies a demo only when legacy editor/watch URLs omit v entirely. */
export function parsePlayerUrl(url: URL): ShareUrlResult {
	if (!['/', '/s'].includes(url.pathname) || url.searchParams.has('v')) return parseShareUrl(url);
	const demo = new URL(url);
	demo.searchParams.set('v', 'dt-SqNL4z3w');
	if (!['t', 'a', 'b'].some((key) => demo.searchParams.has(key))) {
		demo.searchParams.set('a', '31');
		demo.searchParams.set('b', '38');
	}
	return parseShareUrl(demo);
}
