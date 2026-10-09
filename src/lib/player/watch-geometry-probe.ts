import { snapshot } from './watch-viewport.browser-test';

/** Explicit dev-only phone probe: send viewport/frame bounds to the local Vite server. */
export function startGeometryProbe() {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let sequence = 0;
	function capture() {
		if (disposed) return;
		const probe = document.createElement('div');
		probe.style.cssText =
			'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
		document.body.append(probe);
		const style = getComputedStyle(probe);
		const safeArea = {
			top: style.paddingTop,
			right: style.paddingRight,
			bottom: style.paddingBottom,
			left: style.paddingLeft
		};
		probe.remove();
		const player = document.querySelector<HTMLElement>('.player');
		const media = document.querySelector('youtube-video');
		const iframe = media?.shadowRoot?.querySelector('iframe');
		const report = {
			sequence: sequence++,
			url: location.href,
			userAgent: navigator.userAgent,
			dpr: devicePixelRatio,
			safeArea,
			...snapshot(),
			framing: {
				sourceRatio: player?.style.getPropertyValue('--video-source-ratio'),
				width: player?.style.getPropertyValue('--video-width'),
				iframeTransform: iframe && getComputedStyle(iframe).transform
			}
		};
		void fetch('/__watch-geometry', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(report)
		}).catch(() => {});
	}
	function schedule() {
		clearTimeout(timer);
		timer = setTimeout(capture, 250);
	}
	const observer = new ResizeObserver(schedule);
	const canvas = document.querySelector('.media-canvas');
	if (canvas) observer.observe(canvas);
	window.addEventListener('resize', schedule);
	window.addEventListener('scroll', schedule, { passive: true });
	window.visualViewport?.addEventListener('resize', schedule);
	window.visualViewport?.addEventListener('scroll', schedule);
	const initial = setTimeout(capture, 500);
	const settled = setTimeout(capture, 3000);
	return () => {
		disposed = true;
		observer.disconnect();
		clearTimeout(initial);
		clearTimeout(settled);
		clearTimeout(timer);
		window.removeEventListener('resize', schedule);
		window.removeEventListener('scroll', schedule);
		window.visualViewport?.removeEventListener('resize', schedule);
		window.visualViewport?.removeEventListener('scroll', schedule);
	};
}
