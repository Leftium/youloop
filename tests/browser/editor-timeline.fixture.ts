import { type Page } from '@playwright/test';

// Exercise the physical control, including pointer capture and endpoint swapping.
export async function setSliderValue(page: Page, name: string, value: number | string) {
	const slider = page.getByRole('slider', { name, exact: true });
	const axis = (await page.locator('.editor-axis').boundingBox())!;
	const max = Number(await slider.getAttribute('aria-valuemax'));
	const box = (await slider.boundingBox())!;
	await slider.evaluate((el) =>
		el.addEventListener(
			'pointerdown',
			(event) => {
				const pointer = event as PointerEvent;
				const axis = document.querySelector('.editor-axis')!.getBoundingClientRect();
				const max = Number(el.getAttribute('aria-valuemax'));
				const current = Number(el.getAttribute('aria-valuenow'));
				const thumb =
					el.getAttribute('aria-label') !== 'Current time' ||
					(event.target as Element).closest('.playhead');
				el.setAttribute('data-proof-pointer', String(pointer.pointerId));
				el.setAttribute(
					'data-proof-offset',
					String(thumb ? pointer.clientX - axis.left - (current / max) * axis.width : 0)
				);
			},
			{ once: true, capture: true }
		)
	);
	await page.mouse.move(
		box.x + box.width / 2,
		name === 'Current time' ? axis.y + 2 : box.y + box.height / 2
	);
	await page.mouse.down();
	// Browser automation rounds hardware coordinates. Supply an exact fractional
	// move while real pointer capture is held for URL precision characterization.
	await slider.dispatchEvent('pointermove', {
		pointerId: Number(await slider.getAttribute('data-proof-pointer')),
		clientX:
			axis.x +
			(Number(value) / max) * axis.width +
			Number(await slider.getAttribute('data-proof-offset')),
		isPrimary: true
	});
	await page.mouse.up();
}
