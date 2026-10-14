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
				const thumb = el.getAttribute('aria-label') !== 'Current time';
				el.setAttribute('data-proof-pointer', String(pointer.pointerId));
				el.setAttribute(
					'data-proof-offset',
					String(thumb ? pointer.clientX - axis.left - (current / max) * axis.width : 0)
				);
			},
			{ once: true, capture: true }
		)
	);
	let acquireX = box.x + box.width / 2;
	if (name === 'Current time') {
		// Navigation and A/B share a track; start on empty track rather than a handle.
		const handles = await page.locator('.endpoints .thumb').evaluateAll((elements) =>
			elements.map((element) => {
				const bounds = element.getBoundingClientRect();
				return { left: bounds.left, right: bounds.right };
			})
		);
		acquireX =
			[0.5, 0.25, 0.75, 0.1, 0.9]
				.map((fraction) => axis.x + axis.width * fraction)
				.find((x) => handles.every((handle) => x < handle.left || x > handle.right)) ?? acquireX;
	}
	await page.mouse.move(acquireX, name === 'Current time' ? axis.y + 2 : box.y + box.height / 2);
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
