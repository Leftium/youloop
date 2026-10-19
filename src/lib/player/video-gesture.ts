export interface VideoScrub {
	// Current position on the same axis, for offset-preserving touch pickup.
	position?: number;
	begin(): void;
	// Axis position: 0 at the left edge, 1 at the right; caller clamps overshoot.
	move(position: number): void;
	end(commit: boolean): void;
}

// One owner for taps and drags. Direction locks at 8 CSS pixels; capture is
// delayed until horizontal intent, leaving pan-y and pinch to the browser.
export function attachVideoGesture(
	surface: HTMLElement,
	prepare: () => VideoScrub | undefined,
	tap: () => void,
	axisBounds: () => { left: number; width: number } = () => surface.getBoundingClientRect()
) {
	const controller = new AbortController();
	const options = { signal: controller.signal };
	const pointers = new Set<number>();
	let gesture:
		| {
				id: number;
				x: number;
				y: number;
				left: number;
				width: number;
				touch: boolean;
				touchId?: number;
				offset: number;
				horizontal: boolean;
				scrub: VideoScrub;
		  }
		| undefined;
	function finish(commit = false, allowTap = false) {
		const saved = gesture;
		gesture = undefined;
		if (!saved) return;
		if (saved.horizontal) saved.scrub.end(commit);
		else if (allowTap) tap();
		if (surface.hasPointerCapture(saved.id)) surface.releasePointerCapture(saved.id);
	}
	window.addEventListener(
		'pointerdown',
		(event) => {
			pointers.add(event.pointerId);
			if (pointers.size > 1 || !event.isPrimary) finish();
		},
		options
	);
	surface.addEventListener(
		'pointerdown',
		(event) => {
			if (!event.isPrimary || event.button !== 0 || pointers.size > 0) return;
			const scrub = prepare();
			if (!scrub) return;
			const bounds = axisBounds();
			const playhead = bounds.left + (scrub.position ?? NaN) * bounds.width;
			const touch = event.pointerType === 'touch';
			gesture = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				left: bounds.left,
				width: Math.max(1, bounds.width),
				touch,
				// Allow pickup up to 44px inward from either endpoint without moving the axis.
				offset: touch && Math.abs(event.clientX - playhead) <= 44 ? event.clientX - playhead : 0,
				horizontal: false,
				scrub
			};
		},
		options
	);
	// Pointer preventDefault does not cancel native touch panning. Keep this
	// listener on the initial target (touch events retain it outside the video),
	// and cancel only after horizontal intent. Never change touch-action mid-drag.
	surface.addEventListener(
		'touchstart',
		(event) => {
			if (event.touches.length === 1 && gesture?.touch)
				gesture.touchId = event.touches[0].identifier;
		},
		{ ...options, passive: true }
	);
	window.addEventListener(
		'touchstart',
		(event) => {
			if (event.touches.length > 1) finish();
		},
		{ ...options, passive: true }
	);
	surface.addEventListener(
		'touchmove',
		(event) => {
			const saved = gesture;
			if (!saved?.touch || event.touches.length !== 1) return;
			const touch = event.touches[0];
			if (touch.identifier !== saved.touchId) return;
			const dx = touch.clientX - saved.x;
			const dy = touch.clientY - saved.y;
			if (!saved.horizontal && (Math.hypot(dx, dy) <= 8 || Math.abs(dx) <= Math.abs(dy))) return;
			// The browser can already own a gesture. Restore rather than committing
			// a partial scrub when native cancellation is no longer available.
			if (!event.cancelable) {
				finish();
				return;
			}
			event.preventDefault();
		},
		{ ...options, passive: false }
	);
	surface.addEventListener('touchcancel', () => finish(), { ...options, passive: true });
	window.addEventListener(
		'pointermove',
		(event) => {
			const saved = gesture;
			if (!saved || event.pointerId !== saved.id) return;
			const dx = event.clientX - saved.x;
			const dy = event.clientY - saved.y;
			if (!saved.horizontal) {
				if (Math.hypot(dx, dy) <= 8) return;
				if (Math.abs(dx) <= Math.abs(dy)) {
					finish();
					return;
				}
				saved.horizontal = true;
				saved.scrub.begin();
				surface.setPointerCapture(event.pointerId);
			}
			event.preventDefault();
			saved.scrub.move((event.clientX - saved.left - saved.offset) / saved.width);
		},
		{ ...options, passive: false }
	);
	window.addEventListener(
		'pointerup',
		(event) => {
			if (gesture?.id === event.pointerId) {
				// A release can carry travel without an intervening move event.
				const stationary = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 8;
				if (gesture.horizontal)
					gesture.scrub.move((event.clientX - gesture.left - gesture.offset) / gesture.width);
				finish(true, stationary && pointers.size === 1);
			}
			pointers.delete(event.pointerId);
		},
		options
	);
	window.addEventListener(
		'pointercancel',
		(event) => {
			if (gesture?.id === event.pointerId) finish();
			pointers.delete(event.pointerId);
		},
		options
	);
	surface.addEventListener(
		'lostpointercapture',
		(event) => {
			if (gesture?.id === event.pointerId) finish();
		},
		options
	);
	window.addEventListener(
		'scroll',
		() => {
			// An active touch scrub owns its direction. Residual scroll must not
			// turn its final release into a cancellation or a playback toggle.
			if (!gesture?.touch || !gesture.horizontal) finish();
		},
		{ ...options, capture: true, passive: true }
	);
	window.addEventListener('wheel', () => finish(), { ...options, passive: true });
	window.addEventListener(
		'blur',
		() => {
			finish();
			pointers.clear();
		},
		options
	);
	// Pointer activation is handled on release. Synthetic clicks cannot toggle.
	surface.addEventListener(
		'click',
		(event) => {
			event.preventDefault();
			event.stopPropagation();
		},
		options
	);
	return {
		cancel: () => finish(),
		destroy: () => {
			finish();
			pointers.clear();
			controller.abort();
		}
	};
}
