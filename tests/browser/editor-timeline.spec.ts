import { expect, type Page } from '@playwright/test';
import { test } from './youtube-api.fixture';
import { setSliderValue } from './editor-timeline.fixture';

// Probationary through PR 2 in #62; excluded from routine gates. These checks
// cover capture/focus/media ordering that numeric unit tests cannot exercise.
test.describe('editor timeline', { tag: '@timeline-proof' }, () => {
	const slider = (page: Page, name: string) => page.getByRole('slider', { name, exact: true });
	const time = (page: Page) =>
		page.locator('.editor-timeline').getAttribute('data-transport-time').then(Number);
	async function open(page: Page, range = '10.345~20.125') {
		await page.goto(`/?v=dt-SqNL4z3w&t=${range}&mute&fill=0`);
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuemax', '60.25');
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		await page.evaluate(() => {
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			Object.assign(window, {
				savedMedia: media,
				savedEngine: media.engine,
				savedFrame: media.shadowRoot!.querySelector('iframe')
			});
		});
	}
	async function identity(page: Page) {
		expect(
			await page.evaluate(() => {
				const saved = window as unknown as {
					savedMedia: Element;
					savedEngine: unknown;
					savedFrame: Element;
				};
				const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
				return (
					media === saved.savedMedia &&
					media.engine === saved.savedEngine &&
					media.shadowRoot!.querySelector('iframe') === saved.savedFrame
				);
			})
		).toBe(true);
	}

	test('source navigation preserves signed URL bounds and re-enters clip on Play', async ({
		page
	}) => {
		await open(page, '-50.25~-40.125');
		const url = page.url();
		const shared = await page
			.getByRole('link', { name: 'Share URL', exact: true })
			.getAttribute('href');
		await setSliderValue(page, 'Current time', 45.5);
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '45.5');
		await expect.poll(() => time(page)).toBe(45.5);
		await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '10');
		await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '20.125');
		expect(page.url()).toBe(url);
		await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
			'href',
			shared!
		);
		// A later settled-duration observation may resolve signed bounds again,
		// but must not pull paused source navigation back inside A:B.
		await page.locator('youtube-video').evaluate((el) => {
			const media = el as HTMLMediaElement & { engine: { getDuration(): number } };
			media.engine.getDuration = () => 61.25;
			media.dispatchEvent(new Event('durationchange'));
		});
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuemax', '61.25');
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '45.5');
		expect(page.url()).toBe(url);
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect.poll(() => time(page)).toBeLessThan(20.125);
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await setSliderValue(page, 'Current time', 5);
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '5');
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		await identity(page);
	});

	test('pointer crossing keeps capture and physical focus; release and cancellation restore transport', async ({
		page
	}) => {
		await open(page);
		await setSliderValue(page, 'Current time', 15);
		const start = slider(page, 'Repeat start');
		const node = await start.elementHandle();
		const box = (await start.boundingBox())!;
		const axis = (await page.locator('.editor-axis').boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(axis.x + (25 / 60.25) * axis.width, box.y + box.height / 2);
		await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '20.125');
		await expect
			.poll(() => slider(page, 'Repeat end').getAttribute('aria-valuenow').then(Number))
			.toBeCloseTo(25, 1);
		expect(
			await node!.evaluate(
				(el) => el === document.activeElement && el.getAttribute('aria-label') === 'Repeat end'
			)
		).toBe(true);
		await expect
			.poll(() => slider(page, 'Current time').getAttribute('aria-valuenow').then(Number))
			.toBeCloseTo(25, 1);
		expect(await time(page)).toBe(15);
		// A stale provider observation cannot replace the requested inspection frame.
		await page.locator('youtube-video').evaluate((el) => el.dispatchEvent(new Event('timeupdate')));
		await expect
			.poll(() => slider(page, 'Current time').getAttribute('aria-valuenow').then(Number))
			.toBeCloseTo(25, 1);
		await page.mouse.move(axis.x + (12.5 / 60.25) * axis.width, box.y + box.height / 2);
		await expect
			.poll(() => slider(page, 'Repeat start').getAttribute('aria-valuenow').then(Number))
			.toBeCloseTo(12.5, 1);
		await page.mouse.up();
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '15');
		await expect
			.poll(() => page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused))
			.toBe(true);
		await start.evaluate((el) =>
			el.addEventListener(
				'pointerdown',
				(event) => {
					el.setAttribute('data-proof-pointer', String((event as PointerEvent).pointerId));
				},
				{ once: true }
			)
		);
		const nextBox = (await start.boundingBox())!;
		await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2);
		await page.mouse.down();
		await page.mouse.move(axis.x + (axis.width * 14) / 60.25, nextBox.y + nextBox.height / 2);
		await start.dispatchEvent('pointercancel', {
			pointerId: Number(await start.getAttribute('data-proof-pointer'))
		});
		await page.mouse.up();
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '15');
		await identity(page);
	});

	test('keyboard swap preserves non-grid increments and restores playing state on keyup, Escape and blur', async ({
		page
	}) => {
		await open(page, '10.345~10.395');
		await setSliderValue(page, 'Current time', 10.36);
		const start = slider(page, 'Repeat start');
		const node = await start.elementHandle();
		await start.focus();
		await page.keyboard.down('ArrowRight');
		await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '10.395');
		await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '10.445');
		expect(await node!.evaluate((el) => el === document.activeElement)).toBe(true);
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '10.445');
		await page.keyboard.up('ArrowRight');
		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '10.36');
		await setSliderValue(page, 'Repeat end', 30);
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await slider(page, 'Repeat end').focus();
		await page.keyboard.down('ArrowLeft');
		const saved = await time(page);
		await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
		await page.keyboard.press('Escape');
		await page.keyboard.up('ArrowLeft');
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await expect.poll(() => time(page)).toBeGreaterThanOrEqual(saved);
		await page.keyboard.down('ArrowLeft');
		await page.evaluate(() => window.dispatchEvent(new Event('blur')));
		await page.keyboard.up('ArrowLeft');
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		await slider(page, 'Repeat end').press('Home');
		await slider(page, 'Repeat end').press('Home');
		await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '0');
		await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '0');
		await expect(page.getByRole('alert')).toContainText('Invalid clip');
		await slider(page, 'Repeat start').press('ArrowRight');
		await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '0.1');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await identity(page);
	});

	test('red line aligns with source axis across resizing and layouts and stays editor-only', async ({
		page
	}) => {
		await open(page, '0~20.125');
		const displayed = Number(await slider(page, 'Current time').getAttribute('aria-valuenow'));
		expect(await time(page)).toBe(displayed);
		await setSliderValue(page, 'Current time', 40);
		const aligned = async () => {
			await expect
				.poll(() =>
					page.evaluate(() => {
						const line = document.querySelector('.editor-playhead-line')!;
						const rect = line.getBoundingClientRect();
						const axis = document.querySelector('.editor-axis')!.getBoundingClientRect();
						const video = document.querySelector('.player')!.getBoundingClientRect();
						return (
							Math.abs(rect.left - axis.left - (axis.width * 40) / 60.25) < 1 &&
							Math.abs(rect.top - video.top) < 1 &&
							Math.abs(rect.bottom - axis.bottom) < 1 &&
							getComputedStyle(line).pointerEvents === 'none'
						);
					})
				)
				.toBe(true);
		};
		for (const viewport of [
			{ width: 1280, height: 800 },
			{ width: 390, height: 844 },
			{ width: 844, height: 390 }
		]) {
			await page.setViewportSize(viewport);
			for (const label of ['Switch to stacked layout', 'Switch to side-by-side layout']) {
				const toggle = page.getByRole('button', { name: label, exact: true });
				if (viewport.width >= 660 && (await toggle.count())) {
					await expect(toggle).toBeEnabled();
					await toggle.click();
				}
				await aligned();
			}
		}
		for (const name of ['Portrait', 'Fill', 'Landscape', 'Fit']) {
			await page.getByRole('button', { name, exact: true }).click();
			await aligned();
		}
		await identity(page);
		await page.getByRole('link', { name: 'Switch to view-first mode', exact: true }).click();
		await expect(page.locator('.editor-playhead-line')).toHaveCount(0);
		await expect(page.locator('.watch-timeline')).toBeVisible();
	});
});
