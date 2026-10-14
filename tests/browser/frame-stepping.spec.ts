import { expect, type Page } from '@playwright/test';
import { test } from './youtube-api.fixture';
import { setSliderValue } from './editor-timeline.fixture';

// Probationary until Clip-settings PR 4 in #62. No routine gate additions.
test.describe('frame stepping', { tag: '@frame-proof' }, () => {
	test.use({ hasTouch: true });
	const time = (page: Page) =>
		page.locator('.editor-timeline').getAttribute('data-transport-time').then(Number);
	async function open(page: Page) {
		await page.goto('/?v=dt-SqNL4z3w&t=10.345~20.125&mute&fill=0');
		await expect(page.getByRole('slider', { name: 'Current time', exact: true })).toHaveAttribute(
			'aria-valuemax',
			'60.25'
		);
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		await setSliderValue(page, 'Current time', 10.345);
		// Seed and pause on the browser's virtual timeline, avoiding host clock skew.
		await page.clock.install({ time: new Date('2030-01-01T00:00:00Z') });
		await page.clock.pauseAt(new Date('2030-01-01T00:01:00Z'));
		await page.evaluate(() => {
			const media = document.querySelector('youtube-video') as HTMLElement & {
				engine: { seekTo(time: number): void };
			};
			const seeks: { time: number; at: number }[] = [];
			const original = media.engine.seekTo.bind(media.engine);
			media.engine.seekTo = (time) => {
				seeks.push({ time, at: Date.now() });
				original(time);
			};
			Object.assign(window, {
				frameProof: {
					media,
					engine: media.engine,
					iframe: media.shadowRoot!.querySelector('iframe'),
					seeks
				}
			});
		});
	}
	async function holdPointer(page: Page, name = 'Next Frame') {
		const button = page.getByRole('button', { name, exact: true });
		const box = (await button.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		return button;
	}

	test('tap, touch, keyboard and AT step once; holds accumulate through stale provider time', async ({
		page
	}) => {
		await open(page);
		await page.setViewportSize({ width: 390, height: 844 });
		const next = page.getByRole('button', { name: 'Next Frame', exact: true });
		const url = page.url();
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		// Playback can advance before automation delivers the press. Capture its
		// actual fractional origin in the same input dispatch as the first step.
		await next.evaluate((el) =>
			el.addEventListener(
				'pointerdown',
				() => {
					Object.assign(window, {
						frameStart: Number(
							document.querySelector('.editor-timeline')!.getAttribute('data-transport-time')
						)
					});
				},
				{ once: true, capture: true }
			)
		);
		await next.click();
		const start = await page.evaluate(
			() => (window as unknown as { frameStart: number }).frameStart
		);
		expect(await time(page)).toBeCloseTo(start + 1 / 30, 10);
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		await next.tap();
		await next.press('Enter');
		await next.press('Space');
		await next.evaluate((el) => (el as HTMLButtonElement).click());
		expect(await time(page)).toBeCloseTo(start + 5 / 30, 10);
		await page.clock.runFor(200);
		await page.evaluate(() => {
			const media = document.querySelector('youtube-video') as HTMLElement & {
				engine: { getCurrentTime(): number };
			};
			// Polling sees late, nearby and quantized observations, including after release.
			const started = Date.now();
			media.engine.getCurrentTime = () => (Date.now() - started < 400 ? 10.345 : 10.4);
		});
		await holdPointer(page);
		expect(await time(page)).toBeCloseTo(start + 6 / 30, 10);
		await page.clock.runFor(349);
		expect(await time(page)).toBeCloseTo(start + 6 / 30, 10);
		await page.clock.runFor(1);
		expect(await time(page)).toBeCloseTo(start + 7 / 30, 10);
		await page.clock.runFor(200);
		expect(await time(page)).toBeCloseTo(start + 8 / 30, 10);
		await page.mouse.move(1, 1);
		await page.mouse.up();
		await page.clock.runFor(2500);
		expect(await time(page)).toBeCloseTo(start + 8 / 30, 10);
		const prev = page.getByRole('button', { name: 'Prev Frame', exact: true });
		await prev.focus();
		await page.keyboard.down('Space');
		await page.keyboard.down('Space');
		await page.clock.runFor(350);
		await page.keyboard.up('Space');
		await page.clock.runFor(1000);
		expect(await time(page)).toBeCloseTo(start + 6 / 30, 10);
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		expect(page.url()).toBe(url);
		await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveAttribute(
			'aria-valuenow',
			'10.345'
		);
		await expect(page.getByRole('slider', { name: 'Repeat end', exact: true })).toHaveAttribute(
			'aria-valuenow',
			'20.125'
		);
		const proof = await page.evaluate(() => {
			const { media, engine, iframe, seeks } = (
				window as unknown as {
					frameProof: {
						media: HTMLElement & { engine: unknown };
						engine: unknown;
						iframe: Element;
						seeks: { time: number; at: number }[];
					};
				}
			).frameProof;
			return {
				identity:
					media === document.querySelector('youtube-video') &&
					media.engine === engine &&
					media.shadowRoot!.querySelector('iframe') === iframe,
				seeks
			};
		});
		expect(proof.identity).toBe(true);
		expect(proof.seeks.every((seek, i) => !i || seek.at - proof.seeks[i - 1].at >= 200)).toBe(true);
	});

	test('cancellation, history and both frame directions honor the selected playback scope', async ({
		page
	}) => {
		await open(page);
		for (const reason of [
			'pointercancel',
			'lostpointercapture',
			'blur',
			'visibilitychange',
			'interaction'
		]) {
			const before = await time(page);
			const button = await holdPointer(page);
			if (reason === 'pointercancel' || reason === 'lostpointercapture') {
				await button.evaluate((el, type) => {
					for (let id = 0; id < 10; id++)
						if (el.hasPointerCapture(id)) {
							if (type === 'lostpointercapture') el.releasePointerCapture(id);
							else el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true }));
						}
				}, reason);
			} else if (reason === 'interaction') {
				await page.getByRole('slider', { name: 'Current time', exact: true }).focus();
				await page.keyboard.press('Tab');
			} else
				await page.evaluate(
					(type) => (type === 'blur' ? window : document).dispatchEvent(new Event(type)),
					reason
				);
			await page.mouse.up();
			await page.clock.runFor(1000);
			expect(await time(page)).toBeCloseTo(before + 1 / 30, 10);
		}
		await page
			.getByRole('button', { name: 'VIDEO playback, switch to A:B playback', exact: true })
			.click();
		await page.getByRole('button', { name: 'Loop, switch to Once', exact: true }).click();
		await setSliderValue(page, 'Current time', 30.125);
		await page.getByRole('button', { name: 'Next Frame', exact: true }).click();
		await page.clock.runFor(1000);
		expect(await time(page)).toBe(20.125);
		await expect(page.locator('.transport-scope')).toHaveAttribute('aria-pressed', 'true');
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await page.clock.runFor(100);
		expect(await time(page)).toBeGreaterThanOrEqual(10.345);
		expect(await time(page)).toBeLessThan(20.125);
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		const share = await page
			.getByRole('link', { name: 'Share URL', exact: true })
			.getAttribute('href');
		for (const [position, name, expected] of [
			[10.35, 'Prev Frame', 10.345],
			[20.12, 'Next Frame', 20.125]
		] as const) {
			await setSliderValue(page, 'Current time', position);
			await page.getByRole('button', { name, exact: true }).click();
			expect(await time(page)).toBe(expected);
			await setSliderValue(page, 'Current time', expected + (name === 'Prev Frame' ? 0.08 : -0.08));
			await holdPointer(page, name);
			await page.clock.runFor(1500);
			await page.mouse.up();
			expect(await time(page)).toBe(expected);
			await page.clock.runFor(1000);
			expect(await time(page)).toBe(expected);
		}
		await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveAttribute(
			'aria-valuenow',
			'10.345'
		);
		await expect(page.getByRole('slider', { name: 'Repeat end', exact: true })).toHaveAttribute(
			'aria-valuenow',
			'20.125'
		);
		await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
			'href',
			share!
		);
		await page.getByRole('button', { name: 'Once, switch to Loop', exact: true }).click();
		for (const [position, name, expected] of [
			[20.125, 'Next Frame', 10.345],
			[10.345, 'Prev Frame', 20.125]
		] as const) {
			await setSliderValue(page, 'Current time', position);
			await page.getByRole('button', { name, exact: true }).click();
			expect(await time(page)).toBe(expected);
			await setSliderValue(page, 'Current time', position + (name === 'Prev Frame' ? 0.02 : -0.02));
			await holdPointer(page, name);
			await page.clock.runFor(350);
			await page.mouse.up();
			const wrapped = expected + (name === 'Prev Frame' ? -1 / 30 : 1 / 30);
			expect(await time(page)).toBeCloseTo(wrapped, 10);
			await page.clock.runFor(1000);
			expect(await time(page)).toBeCloseTo(wrapped, 10);
		}
		await page.getByRole('button', { name: 'Loop, switch to Once', exact: true }).click();
		await setSliderValue(page, 'Current time', 15);
		await page.getByRole('button', { name: 'Next Frame', exact: true }).focus();
		await page.keyboard.down('Space');
		await page.clock.runFor(350);
		const beforeScopeChange = await time(page);
		await page
			.getByRole('button', { name: 'A:B playback, switch to VIDEO playback', exact: true })
			.click();
		await page.keyboard.up('Space');
		await page.clock.runFor(1000);
		expect(await time(page)).toBeCloseTo(beforeScopeChange, 10);
		for (const [position, name, expected] of [
			[0.01, 'Prev Frame', 0],
			[60.24, 'Next Frame', 60.25]
		] as const) {
			await setSliderValue(page, 'Current time', position);
			await holdPointer(page, name);
			await page.clock.runFor(1000);
			await page.mouse.up();
			expect(await time(page)).toBe(expected);
		}
		await page.getByRole('button', { name: 'Once, switch to Loop', exact: true }).click();
		await page.getByRole('button', { name: 'Next Frame', exact: true }).click();
		expect(await time(page)).toBe(0);
		await page.getByRole('button', { name: 'Prev Frame', exact: true }).click();
		expect(await time(page)).toBe(60.25);
		await page.getByRole('button', { name: 'Loop, switch to Once', exact: true }).click();
		await holdPointer(page, 'Prev Frame');
		await page.evaluate(() => {
			const url = new URL(location.href);
			url.searchParams.set('t', '12~22');
			history.pushState({}, '', url);
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await page.mouse.up();
		await page.clock.runFor(1000);
		await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveAttribute(
			'aria-valuenow',
			'12'
		);
		const afterHistory = await time(page);
		await page.clock.runFor(1000);
		expect(await time(page)).toBe(afterHistory);
		await holdPointer(page);
		await page.evaluate(() => {
			const url = new URL(location.href);
			url.searchParams.set('v', 'jNQXAC9IVRw');
			history.pushState({}, '', url);
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await page.mouse.up();
		await page.clock.runFor(1000);
		await expect(page.locator('youtube-video')).toHaveAttribute('src', /jNQXAC9IVRw/);
		await expect(page.getByRole('slider', { name: 'Current time', exact: true })).toHaveAttribute(
			'aria-valuemax',
			'60.25'
		);
		const afterSource = await time(page);
		await page.clock.runFor(1000);
		expect(await time(page)).toBe(afterSource);
		await holdPointer(page);
		await page.evaluate(() => {
			history.pushState({}, '', '/');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await page.mouse.up();
		await expect(page.locator('.editor-timeline')).toHaveCount(0);
		await page.clock.runFor(1000);
		const seeksAfterUnmount = await page.evaluate(
			() =>
				(window as unknown as { youtubeMockMetrics: { seeks: number } }).youtubeMockMetrics.seeks
		);
		await page.clock.runFor(1000);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { youtubeMockMetrics: { seeks: number } }).youtubeMockMetrics.seeks
			)
		).toBe(seeksAfterUnmount);
	});
});
