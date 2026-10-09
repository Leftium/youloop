// Run from the Vite page's browser console:
// await (await import('/src/lib/player/media-geometry.browser-test.ts')).run()
// Exercises the mounted player and its framing without requiring YouTube playback.
import { calculateFrameVideoWidth } from './video-framing';

export async function run() {
	const container = document.querySelector<HTMLDivElement>('.player')!;
	const canvas = container.querySelector<HTMLDivElement>('.media-canvas')!;
	const media = canvas.querySelector('youtube-video');
	const iframe = media?.shadowRoot?.querySelector('iframe');
	if (!iframe) throw new Error('Wait for the YouTube iframe to mount');
	const buttons = Array.from(
		document.querySelectorAll<HTMLButtonElement>('[aria-label="Media orientation"] button')
	);
	const originalOrientation = buttons.find(
		(button) => button.getAttribute('aria-pressed') === 'true'
	)!;
	const fillButton = document.querySelector<HTMLButtonElement>('[aria-label="Crop to fill"]')!;
	if (!fillButton) throw new Error('Missing Crop to fill button');
	const originalFit = new URL(window.location.href).searchParams.get('fit');
	const originalWidth = container.style.width;
	const results: string[] = [];
	const settle = () =>
		new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
	const assert = (condition: boolean, message: string) => {
		if (!condition) throw new Error(message);
		results.push(message);
	};
	const pressed = () => fillButton.getAttribute('aria-pressed') === 'true';
	const sourceRatio = () =>
		Number(getComputedStyle(container).getPropertyValue('--video-source-ratio'));
	const fitParameter = () => new URL(window.location.href).searchParams.get('fit');

	assert(calculateFrameVideoWidth(300, 600, 16 / 9, false) === 300, 'Fit by width');
	assert(calculateFrameVideoWidth(300, 600, 16 / 9, true) === 600 * (16 / 9), 'Fill by height');
	assert(calculateFrameVideoWidth(800, 450, 9 / 16, false) === 450 * (9 / 16), 'Portrait Fit');
	assert(calculateFrameVideoWidth(800, 450, 9 / 16, true) === 800, 'Portrait Fill');
	assert(calculateFrameVideoWidth(0, 450, 16 / 9, true) === null, 'Invalid size fallback');

	try {
		for (const orientation of ['Landscape', 'Portrait', 'Landscape', 'Portrait']) {
			const button = buttons.find((candidate) => candidate.getAttribute('aria-label') === orientation)!;
			button.click();
			await settle();
			const sourceOrientation = sourceRatio() < 1 ? 'Portrait' : 'Landscape';
			assert(
				pressed() === (orientation !== sourceOrientation) && fitParameter() === null,
				`${orientation}: automatic Fill default and URL reset`
			);

			for (const fill of [false, true]) {
				if (pressed() !== fill) fillButton.click();
				await settle();
				assert(pressed() === fill, `${orientation}: ${fill ? 'Fill' : 'Fit'} selected`);

				for (const width of [1100, 320, 800, 240, 1100]) {
					container.style.width = `${width}px`;
					await settle();
					const bounds = canvas.getBoundingClientRect();
					const outer = container.getBoundingClientRect();
					const ratio = orientation === 'Portrait' ? 9 / 16 : 16 / 9;
					if (
						Math.abs(bounds.width / bounds.height - ratio) > 0.002 ||
						bounds.width > outer.width + 1 ||
						bounds.height > outer.height + 1 ||
						Math.abs(outer.width / outer.height - 16 / 9) > 0.002 ||
						Math.abs(bounds.left + bounds.width / 2 - outer.left - outer.width / 2) > 1 ||
						Math.abs(bounds.top + bounds.height / 2 - outer.top - outer.height / 2) > 1 ||
						getComputedStyle(canvas).contain !== 'size layout' ||
						canvas.querySelector('youtube-video') !== media
					) {
						throw new Error(`${orientation} at ${width}px: media geometry or identity changed`);
					}
					const frame = iframe.getBoundingClientRect();
					const desiredWidth = calculateFrameVideoWidth(
						bounds.width,
						bounds.height,
						sourceRatio(),
						fill
					);
					if (
						desiredWidth === null ||
						Math.abs(frame.height - 16000) > 1 ||
						Math.abs(frame.width - desiredWidth) > 1 ||
						Math.abs(frame.top + frame.height / 2 - bounds.top - bounds.height / 2) > 1 ||
						Math.abs(frame.left + frame.width / 2 - bounds.left - bounds.width / 2) > 1 ||
						iframe.tabIndex !== -1 ||
						media?.shadowRoot?.querySelector('iframe') !== iframe
					) {
						throw new Error(`${orientation} at ${width}px: iframe crop, focus or identity changed`);
					}
					results.push(`${orientation} at ${width}px, ${fill ? 'Fill' : 'Fit'}`);
				}
				// Verify manually toggling Fill/Back provides explicit URL state.
				fillButton.click();
				await settle();
				assert(fitParameter() === (fill ? 'contain' : 'cover'), 'Manual Fit/Fill URL override');
				fillButton.click();
				await settle();
			}
		}
		return results;
	} finally {
		container.style.width = originalWidth;
		originalOrientation.click();
		await settle();
		if (originalFit === 'cover' || originalFit === 'contain') {
			const desired = originalFit === 'cover';
			if (pressed() === desired) fillButton.click();
			fillButton.click();
			await settle();
		}
	}
}
