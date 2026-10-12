/** Input values use seconds; undefined flags retain default/automatic behavior. */
export interface ShareUrlState {
	videoId: string;
	start?: number;
	end?: number;
	once?: boolean;
	mute?: boolean;
	speed?: number;
	vertical?: boolean;
	fill?: boolean;
}

export interface ShareUrlError {
	parameter: string;
	code: 'invalid' | 'duplicate';
}

export type ShareUrlResult =
	{ ok: true; value: ShareUrlState } | { ok: false; errors: ShareUrlError[] };

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const decimalPattern = /^\d+(?:\.\d+)?$/;
const flags = ['once', 'mute', 'vertical', 'fill'] as const;
const recognized = ['v', 't', 'a', 'b', 'speed', 'orientation', 'fit', ...flags];

/**
 * Validate and copy state, removing start=0, once=false, and speed=1 defaults.
 * False mute/vertical/fill values remain explicit overrides. No duration is
 * available here: the integration must validate bounds against the loaded video.
 * Speed accepts continuous multipliers from 0.25 to 2; provider support is separate.
 */
export function normalizeShareUrl(state: ShareUrlState): ShareUrlResult {
	const errors: ShareUrlError[] = [];
	const invalid = (parameter: string) => errors.push({ parameter, code: 'invalid' });
	if (typeof state.videoId !== 'string' || !videoIdPattern.test(state.videoId)) invalid('videoId');
	for (const key of ['start', 'end'] as const) {
		const value = state[key];
		if (value !== undefined && (!Number.isFinite(value) || value < 0)) invalid(key);
	}
	if (state.end !== undefined && state.end <= (state.start ?? 0)) invalid('end');
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
	for (const key of ['mute', 'vertical', 'fill'] as const) {
		if (state[key] !== undefined) value[key] = state[key];
	}
	return { ok: true, value };
}

/**
 * Parse an absolute URL or root-relative path (including legacy / and /s).
 * Canonical path/t/vertical/fill take precedence over v/a+b/orientation/fit,
 * even when invalid. Duplicate recognized keys fail, including shadowed aliases;
 * unknown keys and fragments are ignored. Malformed selected values fail the
 * whole parse rather than quietly changing the requested video or clip.
 * Empty boolean values (bare or '=') mean true. Both '-' and ':' delimit ranges.
 * Legacy b=0 and b=99999 mean video end; canonical t endpoints are literal.
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

	let videoId: string;
	try {
		videoId = ['/', '/s'].includes(url.pathname)
			? (params.get('v') ?? '')
			: decodeURIComponent(url.pathname.slice(1));
	} catch {
		return { ok: false, errors: [{ parameter: 'videoId', code: 'invalid' }] };
	}
	const state: ShareUrlState = { videoId };
	const seconds = (raw: string, key: string): number | undefined => {
		const value = Number(raw);
		if (
			!decimalPattern.test(raw) ||
			!Number.isFinite(value) ||
			(value === 0 && /[1-9]/.test(raw))
		) {
			invalid(key);
			return undefined;
		}
		return value;
	};
	if (params.has('t')) {
		const match = /^(\d+(?:\.\d+)?)?[-:](\d+(?:\.\d+)?)?$/.exec(params.get('t')!);
		if (!match) invalid('t');
		else {
			if (match[1]) state.start = seconds(match[1], 't');
			if (match[2]) state.end = seconds(match[2], 't');
		}
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
function decimal(value: number): string {
	const [mantissa, exponent] = String(value).split('e');
	if (exponent === undefined) return mantissa;
	const [whole, fraction = ''] = mantissa.split('.');
	const digits = whole + fraction;
	const point = whole.length + Number(exponent);
	if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`;
	if (point >= digits.length) return digits + '0'.repeat(point - digits.length);
	return `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** Return a root-relative canonical URL; throw RangeError for invalid state. */
export function serializeShareUrl(state: ShareUrlState): string {
	const result = normalizeShareUrl(state);
	if (!result.ok) {
		throw new RangeError(
			`Invalid share URL state: ${result.errors.map((e) => e.parameter).join(', ')}`
		);
	}
	const value = result.value;
	const query: string[] = [];
	if (value.start !== undefined || value.end !== undefined) {
		query.push(
			`t=${value.start === undefined ? '' : decimal(value.start)}-${value.end === undefined ? '' : decimal(value.end)}`
		);
	}
	for (const key of ['once', 'mute'] as const) {
		if (value[key] !== undefined) query.push(value[key] ? key : `${key}=0`);
	}
	if (value.speed !== undefined) query.push(`speed=${decimal(value.speed)}`);
	for (const key of ['vertical', 'fill'] as const) {
		if (value[key] !== undefined) query.push(value[key] ? key : `${key}=0`);
	}
	return `/${value.videoId}${query.length ? `?${query.join('&')}` : ''}`;
}

/** Preserve editor intent using the same canonical query grammar. */
export function serializeEditorUrl(state: ShareUrlState): string {
	const canonical = serializeShareUrl(state);
	const query = canonical.split('?')[1];
	return `/?v=${state.videoId}${query ? `&${query}` : ''}`;
}
