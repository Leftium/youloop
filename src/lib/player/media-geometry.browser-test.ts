// Run from the Vite page's browser console:
// await (await import('/src/lib/player/media-geometry.browser-test.ts')).run()
// Exercises the mounted player without requiring YouTube playback.
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
	const originalFill = fillButton.getAttribute('aria-pressed') === 'true';
	const originalWidth = container.style.width;
	const results: string[] = [];
	const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	try {
		if (originalFill) fillButton.click();
		for (const fill of [false, true]) {
			if (fill) fillButton.click();
			await settle();
			if (
				(fillButton.getAttribute('aria-pressed') === 'true') !== fill ||
				new URL(window.location.href).searchParams.get('fit') !== (fill ? 'cover' : null)
			) {
				throw new Error(`Fill mode or URL did not update: ${fill}`);
			}
			for (const orientation of ['Landscape', 'Portrait', 'Landscape', 'Portrait']) {
				buttons.find((button) => button.getAttribute('aria-label') === orientation)!.click();
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
					const zoom = fill ? 256 / 81 : 1;
					if (
						Math.abs(frame.height - 16000) > 1 ||
						Math.abs(frame.width - bounds.width * zoom) > 1 ||
						Math.abs(frame.top + frame.height / 2 - bounds.top - bounds.height / 2) > 1 ||
						Math.abs(frame.left + frame.width / 2 - bounds.left - bounds.width / 2) > 1 ||
						iframe.tabIndex !== -1 ||
						media?.shadowRoot?.querySelector('iframe') !== iframe
					) {
						throw new Error(`${orientation} at ${width}px: iframe crop, focus or identity changed`);
					}
					results.push(`${orientation} at ${width}px, ${fill ? 'Fill' : 'Fit'}`);
				}
			}
		}
		return results;
	} finally {
		container.style.width = originalWidth;
		if ((fillButton.getAttribute('aria-pressed') === 'true') !== originalFill) fillButton.click();
		originalOrientation.click();
	}
}
