// YouTube exposes seconds-based seeks, not decoded frames or source FPS.
export const nominalFrameSeconds = 1 / 30;
export const frameHoldDelay = 350;
export const frameRepeatInterval = 200;

export function frameStepTarget(
	start: number,
	quanta: number,
	bounds: { start: number; end: number },
	seconds = nominalFrameSeconds,
	loop = false
): number | undefined {
	if (
		![start, quanta, bounds.start, bounds.end, seconds].every(Number.isFinite) ||
		bounds.start < 0 ||
		bounds.end <= bounds.start ||
		seconds <= 0
	)
		return undefined;
	// Anchor plus integer quanta preserves fractional offsets without repeated-add drift.
	// Scrubbing can leave the selected scope; re-enter its nearest edge first.
	if (start < bounds.start || start > bounds.end)
		return Math.max(bounds.start, Math.min(bounds.end, start));
	const requested = start + quanta * seconds;
	if (loop && requested > bounds.end) return bounds.start;
	if (loop && requested < bounds.start) return bounds.end;
	return Math.max(bounds.start, Math.min(bounds.end, requested));
}

export function createFrameStepper(options: {
	position(): number;
	bounds(): { start: number; end: number };
	loop(): boolean;
	show(time: number): void;
	seek(time: number): void;
}) {
	let anchor: number | undefined;
	let quanta = 0;
	let target: number | undefined;
	let queued: number | undefined;
	let lastSent = -Infinity;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function send() {
		timer = undefined;
		if (queued === undefined) return;
		const time = queued;
		queued = undefined;
		lastSent = Date.now();
		options.seek(time);
	}
	return {
		get target() {
			return target;
		},
		step(direction: number) {
			const start = anchor ?? options.position();
			const bounds = options.bounds();
			const looping = options.loop();
			const next = frameStepTarget(start, quanta + direction, bounds, nominalFrameSeconds, looping);
			if (next === undefined) return false;
			anchor = start;
			quanta += direction;
			const previous = target ?? start;
			target = next;
			options.show(next);
			if (next !== previous) {
				// Rapid taps replace the unsent target; never buffer a command per tap.
				queued = next;
				if (!timer) {
					const remaining = lastSent + frameRepeatInterval - Date.now();
					if (remaining <= 0) send();
					else timer = setTimeout(send, remaining);
				}
			}
			if (next === bounds.start || next === bounds.end) {
				anchor = next;
				quanta = 0;
				return looping;
			}
			return true;
		},
		reset() {
			clearTimeout(timer);
			timer = undefined;
			anchor = target = queued = undefined;
			quanta = 0;
			lastSent = -Infinity;
		}
	};
}

// Both buttons share one timer and input owner. Native keyboard clicks are
// prevented; detail=0 click remains available to assistive-technology activation.
export function attachFrameHold(
	buttons: readonly HTMLButtonElement[],
	step: (direction: number) => boolean
) {
	const controller = new AbortController();
	const options = { signal: controller.signal };
	let active:
		{ button: HTMLButtonElement; direction: number; pointer?: number; key?: string } | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	function cancel() {
		clearTimeout(timer);
		timer = undefined;
		const saved = active;
		active = undefined;
		if (saved?.pointer !== undefined && saved.button.hasPointerCapture(saved.pointer))
			saved.button.releasePointerCapture(saved.pointer);
	}
	function repeat() {
		timer = undefined;
		if (!active || active.button.disabled || !active.button.isConnected) return cancel();
		if (!step(active.direction)) return cancel();
		timer = setTimeout(repeat, frameRepeatInterval);
	}
	function begin(next: NonNullable<typeof active>) {
		cancel();
		if (next.button.disabled) return;
		active = next;
		if (step(next.direction)) timer = setTimeout(repeat, frameHoldDelay);
		else cancel();
	}
	buttons.forEach((button, index) => {
		const direction = index === 0 ? -1 : 1;
		button.addEventListener(
			'pointerdown',
			(event) => {
				if (!event.isPrimary || event.button !== 0 || active) return;
				event.preventDefault();
				button.focus({ preventScroll: true });
				begin({ button, direction, pointer: event.pointerId });
				if (active) button.setPointerCapture(event.pointerId);
			},
			options
		);
		button.addEventListener(
			'keydown',
			(event) => {
				if (event.key !== ' ' && event.key !== 'Enter') return;
				event.preventDefault();
				if (!event.repeat && !active) begin({ button, direction, key: event.key });
			},
			options
		);
		button.addEventListener(
			'keyup',
			(event) => {
				if (event.key !== ' ' && event.key !== 'Enter') return;
				event.preventDefault();
				if (active?.button === button && active.key === event.key) cancel();
			},
			options
		);
		button.addEventListener(
			'click',
			(event) => {
				event.preventDefault();
				if (event.detail === 0 && !active && !button.disabled) step(direction);
			},
			options
		);
		button.addEventListener(
			'lostpointercapture',
			(event) => {
				if (active?.button === button && active.pointer === event.pointerId) cancel();
			},
			options
		);
		button.addEventListener('blur', cancel, options);
		button.addEventListener('contextmenu', (event) => event.preventDefault(), options);
	});
	window.addEventListener(
		'pointerup',
		(event) => {
			if (active?.pointer === event.pointerId) cancel();
		},
		options
	);
	window.addEventListener('pointercancel', cancel, options);
	window.addEventListener('pointerdown', () => cancel(), { ...options, capture: true });
	window.addEventListener(
		'keydown',
		(event) => {
			if (active && (event.target !== active.button || event.key !== active.key)) cancel();
		},
		{ ...options, capture: true }
	);
	window.addEventListener('blur', cancel, options);
	window.addEventListener('pagehide', cancel, options);
	window.addEventListener('scroll', cancel, { ...options, capture: true, passive: true });
	document.addEventListener('visibilitychange', cancel, options);
	return {
		cancel,
		destroy() {
			cancel();
			controller.abort();
		}
	};
}
