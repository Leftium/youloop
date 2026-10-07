// Run from the Vite page's browser console:
// await (await import('/src/lib/player/media-geometry.browser-test.ts')).run()
// Exercises the mounted player without requiring YouTube playback.
export async function run() {
	const container = document.querySelector<HTMLDivElement>('.player')!;
	const canvas = container.querySelector<HTMLDivElement>('.media-canvas')!;
	const media = canvas.querySelector('youtube-video');
	const buttons = Array.from(
		document.querySelectorAll<HTMLButtonElement>('[aria-label="Media orientation"] button')
	);
	const originalOrientation = buttons.find(
		(button) => button.getAttribute('aria-pressed') === 'true'
	)!;
	const originalWidth = container.style.width;
	const results: string[] = [];
	const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	try {
		for (const orientation of ['Landscape', 'Portrait', 'Landscape', 'Portrait']) {
			buttons.find((button) => button.textContent?.trim() === orientation)!.click();
			for (const width of [1100, 320, 800, 240, 1100]) {
				container.style.width = `${width}px`;
				await settle();
				const bounds = canvas.getBoundingClientRect();
				const outer = container.getBoundingClientRect();
				const ratio = orientation === 'Portrait' ? 9 / 16 : 16 / 9;
				if (
					Math.abs(bounds.width / bounds.height - ratio) > 0.002 ||
					bounds.width > outer.width + 1 ||
					Math.abs(bounds.height - outer.height) > 1 ||
					getComputedStyle(canvas).contain !== 'size layout' ||
					canvas.querySelector('youtube-video') !== media
				) {
					throw new Error(`${orientation} at ${width}px: media geometry or identity changed`);
				}
				results.push(`${orientation} at ${width}px`);
			}
		}
		return results;
	} finally {
		container.style.width = originalWidth;
		originalOrientation.click();
	}
}
