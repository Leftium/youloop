import { expect, type Page } from '@playwright/test';
import { test } from './youtube-api.fixture';
import { setSliderValue } from './editor-timeline.fixture';

// Probationary through PR 3 in #62; excluded from routine gates. These checks
// cover capture/focus/media ordering that numeric unit tests cannot exercise.
test.describe('editor timeline', { tag: '@timeline-proof' }, () => {
	test.use({ hasTouch: true });
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
		// The 0.05-second selection leaves pointer hit targets overlapping.
		// Separate them by keyboard before checking playback restoration.
		await slider(page, 'Repeat end').press('End');
		await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '10.395');
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

	for (const watch of [false, true]) {
		test(`video scrub ${watch ? 'watch' : 'editor'} previews, cancels, commits and preserves controls`, async ({
			page
		}, testInfo) => {
			await page.goto(
				watch
					? '/dt-SqNL4z3w/10~20.125?mute&fill=0'
					: '/?v=dt-SqNL4z3w&t=-50.25~-40.125&mute&fill=0'
			);
			const surface = page.locator('.video-surface');
			const display = watch ? page.getByRole('progressbar') : slider(page, 'Current time');
			await expect(display).toHaveAttribute('aria-valuemax', watch ? '10.125' : '60.25');
			if (watch)
				await page
					.getByRole('button', { name: 'A:B progress, switch to full-video playback', exact: true })
					.click();
			await expect(display).toHaveAttribute('aria-valuemax', '60.25');
			const original = Number(await display.getAttribute('aria-valuenow'));
			const url = page.url();
			const media = await page.locator('youtube-video').elementHandle();
			const frame = await page
				.locator('youtube-video')
				.evaluate((el) => el.shadowRoot!.querySelector('iframe')!.getAttribute('src'));
			const box = (await surface.boundingBox())!;
			const x = box.x + box.width * 0.25,
				y = box.y + box.height * 0.5;
			const dragX = Math.round(x + box.width * 0.1);
			const axisBox = watch ? box : (await page.locator('.editor-axis').boundingBox())!;
			const targetTime = ((dragX - axisBox.x) / axisBox.width) * 60.25;
			await surface.evaluate((el) =>
				el.addEventListener('pointerdown', (event) =>
					el.setAttribute('data-pointer', String((event as PointerEvent).pointerId))
				)
			);
			await page.mouse.move(x, y);
			await page.mouse.down();
			await expect(display).toHaveAttribute('aria-valuenow', String(original));
			await page.mouse.move(dragX, y + 2);
			await expect
				.poll(() => display.getAttribute('aria-valuenow').then(Number))
				.toBeCloseTo(targetTime, 1);
			if (!watch) expect(await time(page)).toBe(original);
			await page
				.locator('youtube-video')
				.evaluate((el) => el.dispatchEvent(new Event('timeupdate')));
			await expect
				.poll(() => display.getAttribute('aria-valuenow').then(Number))
				.toBeCloseTo(targetTime, 1);
			await surface.dispatchEvent('pointercancel', {
				pointerId: Number(await surface.getAttribute('data-pointer'))
			});
			await page.mouse.up();
			await expect(display).toHaveAttribute('aria-valuenow', String(original));
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(dragX, y);
			await page.mouse.up();
			await expect
				.poll(() => display.getAttribute('aria-valuenow').then(Number))
				.toBeCloseTo(targetTime, 1);
			if (!watch) {
				await expect.poll(() => time(page)).toBeCloseTo(targetTime, 1);
				await expect(slider(page, 'Repeat start')).toHaveAttribute('aria-valuenow', '10');
				await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '20.125');
				await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
					'href',
					/-50.25~-40.125/
				);
				const line = await page.locator('.editor-playhead-line').boundingBox();
				expect(Math.abs(line!.x - dragX)).toBeLessThan(1);
				await expect(page.locator('.editor-playhead-line')).not.toHaveClass(/inside-clip/);
				expect(
					await page
						.locator('.playhead')
						.evaluate((el) => getComputedStyle(el, '::after').borderTopColor)
				).toBe('rgb(255, 51, 51)');
				await setSliderValue(page, 'Current time', 15);
				const combined = await page.evaluate(() => {
					const box = (selector: string) =>
						document.querySelector(selector)!.getBoundingClientRect();
					const color = (selector: string) =>
						getComputedStyle(document.querySelector(selector)!).backgroundColor;
					const axis = box('.editor-axis');
					const stamps = box('.timestamps');
					const buttons = box('.preview-playback');
					const line = box('.editor-playhead-line');
					return {
						flush: Math.abs(axis.top - box('.player').bottom),
						lineEnd: Math.abs(line.bottom - axis.top),
						belowGap: buttons.top - axis.bottom,
						lineColor: getComputedStyle(document.querySelector('.editor-playhead-line')!)
							.backgroundColor.match(/\d+/g)!
							.slice(0, 3)
							.map(Number),
						arrowColor: getComputedStyle(document.querySelector('.playhead')!, '::after')
							.borderTopColor,
						insets: [
							Math.abs(axis.left - stamps.left),
							Math.abs(axis.right - stamps.right),
							Math.abs(axis.left - buttons.left),
							Math.abs(axis.right - buttons.right)
						],
						heights: [
							axis.height,
							box('.endpoints .track').height,
							Number.parseFloat(
								getComputedStyle(document.querySelector('.endpoints .thumb')!, '::after').height
							)
						],
						colors: ['.navigation', '.progress', '.selection', '.overlap'].map((selector) =>
							color('.editor-timeline ' + selector)
						),
						overlap:
							box('.editor-timeline .overlap').width / box('.editor-timeline .selection').width
					};
				});
				expect(combined.flush).toBeLessThan(1);
				expect(combined.lineEnd).toBeLessThan(1);
				expect(combined.belowGap).toBeGreaterThanOrEqual(12);
				expect(combined.lineColor).toEqual([168, 85, 247]);
				expect(combined.arrowColor).toBe('rgb(168, 85, 247)');
				expect(combined.insets.every((inset) => inset < 1)).toBe(true);
				expect(combined.heights).toEqual([20, 20, 20]);
				expect(combined.colors).toEqual([
					'rgb(170, 170, 170)',
					'rgb(255, 51, 51)',
					'rgb(51, 153, 255)',
					'rgb(168, 85, 247)'
				]);
				expect(combined.overlap).toBeCloseTo(5 / 10.125, 2);
				await slider(page, 'Current time').evaluate((el) => (el as HTMLElement).blur());
				await page.screenshot({ path: testInfo.outputPath('combined-timeline.png') });
			} else await expect(page.locator('.editor-playhead-line')).toHaveCount(0);
			// Native vertical intent and synthetic clicks cannot toggle playback.
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + 2, y + 40);
			await page.mouse.up();
			await surface.dispatchEvent('click');
			expect(
				await page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused)
			).toBe(true);
			const starts = await page.evaluate(
				() =>
					(window as unknown as { youtubeMockMetrics: { starts: number } }).youtubeMockMetrics
						.starts
			);
			await page.touchscreen.tap(x, y);
			await expect
				.poll(() => page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused))
				.toBe(false);
			expect(
				await page.evaluate(
					() =>
						(window as unknown as { youtubeMockMetrics: { starts: number } }).youtubeMockMetrics
							.starts
				)
			).toBe(starts + 1);
			// A playing scrub within scope resumes after commit.
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + box.width * 0.02, y);
			await page.mouse.up();
			await expect
				.poll(() => page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused))
				.toBe(false);
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + box.width * 0.04, y);
			await page.evaluate(() => window.dispatchEvent(new Event('blur')));
			await page.mouse.up();
			await expect
				.poll(() => page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused))
				.toBe(false);
			// Keyboard activation remains available in both modes.
			await page.getByRole('button', { name: 'Pause video', exact: true }).focus();
			await page.keyboard.press('Enter');
			await expect
				.poll(() => page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused))
				.toBe(true);
			if (watch)
				await page
					.getByRole('button', { name: 'VIDEO progress, switch to A:B playback', exact: true })
					.click();
			await page.mouse.move(x, y);
			await page.mouse.down();
			await page.mouse.move(x + box.width * 0.95, y);
			await page.mouse.up();
			await expect(display).toHaveAttribute('aria-valuenow', watch ? '10.125' : '60.25');
			if (!watch) {
				// Alignment must hold near both ends, including narrow layouts.
				for (const width of [1280, 390]) {
					await page.setViewportSize({ width, height: 844 });
					const axis = (await page.locator('.editor-axis').boundingBox())!;
					const video = (await surface.boundingBox())!;
					for (const fraction of [0.1, 0.9]) {
						const cursor = Math.round(axis.x + axis.width * fraction);
						await page.mouse.move(cursor - 12, video.y + video.height / 2);
						await page.mouse.down();
						await page.mouse.move(cursor, video.y + video.height / 2);
						await page.mouse.up();
						await expect
							.poll(async () => (await page.locator('.editor-playhead-line').boundingBox())!.x)
							.toBeCloseTo(cursor, 0);
					}
				}
			}
			expect(page.url()).toBe(url);
			expect(await media!.evaluate((el) => el === document.querySelector('youtube-video'))).toBe(
				true
			);
			expect(
				await page
					.locator('youtube-video')
					.evaluate((el) => el.shadowRoot!.querySelector('iframe')!.getAttribute('src'))
			).toBe(frame);
			if (watch) {
				await page.goto('/dt-SqNL4z3w/10~20.125?mute&vertical&fill=0');
				const timeline = page.locator('.watch-timeline');
				await expect(timeline).toHaveAttribute('aria-valuemax', '10.125');
				await page
					.getByRole('button', { name: 'A:B progress, switch to full-video playback', exact: true })
					.click();
				await expect(timeline).toHaveAttribute('aria-valuemax', '60.25');
				const video = (await surface.boundingBox())!;
				const fullAxis = (await page.locator('.watch-timeline .timeline-track').boundingBox())!;
				expect(fullAxis.width).toBeLessThan(video.width / 2);
				async function dragAt(cursor: number) {
					const bounds = (await surface.boundingBox())!;
					await page.mouse.move(cursor - 12, bounds.y + bounds.height / 2);
					await page.mouse.down();
					await page.mouse.move(cursor, bounds.y + bounds.height / 2);
					await page.mouse.up();
				}
				const cursor = Math.round(fullAxis.x + fullAxis.width * 0.25);
				await dragAt(cursor);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(((cursor - fullAxis.x) / fullAxis.width) * 60.25, 1);
				const leftMargin = Math.round(video.x + 30);
				await dragAt(leftMargin);
				await expect(timeline).toHaveAttribute('aria-valuenow', '0');
				await dragAt(Math.round(video.x + video.width - 30));
				await expect(timeline).toHaveAttribute('aria-valuenow', '60.25');
				await page.touchscreen.tap(leftMargin, video.y + video.height / 2);
				await expect
					.poll(() =>
						page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused)
					)
					.toBe(false);
				await page.touchscreen.tap(leftMargin, video.y + video.height / 2);
				await expect
					.poll(() =>
						page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).paused)
					)
					.toBe(true);
				await page
					.getByRole('button', { name: 'VIDEO progress, switch to A:B playback', exact: true })
					.click();
				const clipAxis = (await page.locator('.watch-timeline .timeline-track').boundingBox())!;
				expect(clipAxis.width).toBeLessThan(fullAxis.width);
				const clipCursor = Math.round(clipAxis.x + clipAxis.width * 0.3);
				const elapsed = ((clipCursor - clipAxis.x) / clipAxis.width) * 10.125;
				await dragAt(clipCursor);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(elapsed, 1);
				await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }));
				await expect(page.locator('.share-prototype')).toHaveAttribute('data-mode', 'theater');
				await expect(timeline).toBeHidden();
				await dragAt(leftMargin);
				await expect(timeline).toHaveAttribute('aria-valuenow', '0');
				await dragAt(clipCursor);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(elapsed, 1);
				await expect(page.locator('.editor-playhead-line')).toHaveCount(0);
			}
			expect(await surface.evaluate((el) => getComputedStyle(el).touchAction)).toBe(
				'pan-y pinch-zoom'
			);
		});
	}
});
