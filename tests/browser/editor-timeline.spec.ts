import { expect, type Page } from '@playwright/test';
import { test } from './youtube-api.fixture';
import { setSliderValue } from './editor-timeline.fixture';

// Reviewed in PR 3; probationary through Clip-settings PR 4 in #62, outside routine. These checks
// cover capture/focus/media ordering that numeric unit tests cannot exercise.
test.describe('editor timeline', { tag: '@timeline-proof' }, () => {
	test.use({ hasTouch: true });
	const slider = (page: Page, name: string) => page.getByRole('slider', { name, exact: true });
	const time = (page: Page) =>
		page.locator('.editor-timeline').getAttribute('data-transport-time').then(Number);
	async function screenshotControls(page: Page, path: string) {
		const preview = (await page.locator('.editor-preview-content').boundingBox())!;
		const axis = (await page.locator('.editor-axis').boundingBox())!;
		const actions = (await page.locator('.preview-actions').boundingBox())!;
		const top = Math.max(0, axis.y - 64);
		const bottom = Math.min(page.viewportSize()!.height, actions.y + actions.height + 8);
		await page.screenshot({
			path,
			clip: { x: preview.x, y: top, width: preview.width, height: bottom - top }
		});
	}
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
	}, testInfo) => {
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
		// Endpoint edits retain a positive interval at both source edges without
		// inserting an error or shifting layout. The wider handle outranks splitter padding.
		const edgeAxis = (await page.locator('.editor-axis').boundingBox())!;
		const separator = page.getByRole('separator', { name: 'Resize video preview' });
		const splitPosition = await separator.getAttribute('aria-valuenow');
		for (const [name, key, direction] of [
			['Repeat end', 'Home', 1],
			['Repeat start', 'End', -1]
		] as const) {
			await slider(page, direction === 1 ? 'Repeat start' : 'Repeat end').press(key);
			await slider(page, direction === 1 ? 'Repeat end' : 'Repeat start').press(key);
			const hidden = slider(page, name === 'Repeat end' ? 'Repeat start' : 'Repeat end');
			expect((await hidden.boundingBox())!.width).toBeLessThan(1);
			const a = Number(await slider(page, 'Repeat start').getAttribute('aria-valuenow'));
			const b = Number(await slider(page, 'Repeat end').getAttribute('aria-valuenow'));
			expect(b - a).toBeCloseTo(1 / 30, 8);
			await expect(page.getByRole('alert')).toHaveCount(0);
			const handle = slider(page, name);
			const captured = await handle.elementHandle();
			await page.evaluate(() =>
				document.addEventListener(
					'pointerdown',
					(event) => {
						for (const el of document.querySelectorAll('.endpoints .thumb'))
							el.setAttribute('data-captured-pointer', String(event.pointerId));
					},
					{ once: true, capture: true }
				)
			);

			const edgeX = edgeAxis.x + (direction === 1 ? 0 : edgeAxis.width);
			await page.mouse.move(edgeX + direction * 4, edgeAxis.y - 8);
			await page.mouse.down();
			expect(
				await captured!.evaluate((el) =>
					el.hasPointerCapture(Number(el.getAttribute('data-captured-pointer')))
				)
			).toBe(true);
			await page.mouse.move(edgeX + direction * 18, edgeAxis.y - 8);
			await page.mouse.up();
			await expect(separator).toHaveAttribute('aria-valuenow', splitPosition!);
			const after = (await page.locator('.editor-axis').boundingBox())!;
			expect(after).toEqual(edgeAxis);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				page.viewportSize()!.width
			);
		}

		// Empty timeline beneath splitter padding seeks instead of resizing.
		// A/B stay away from the source edge so this exercises navigation.
		await setSliderValue(page, 'Repeat start', 10);
		await setSliderValue(page, 'Repeat end', 20);
		for (const [width, height] of [
			[1280, 844],
			[390, 844]
		]) {
			await page.setViewportSize({ width, height });
			await expect(page.locator('.workspace-grid')).toHaveAttribute(
				'data-layout',
				width < 660 ? 'rows' : 'columns'
			);
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			const box = (await page.locator('.editor-axis').boundingBox())!;
			const split = await separator.getAttribute('aria-valuenow');
			for (const x of [box.x + 2, box.x + box.width - 2]) {
				await page.mouse.click(x, box.y + box.height / 2);
				await expect
					.poll(() => slider(page, 'Current time').getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(((x - box.x) / box.width) * 60.25, 1);
				await expect(separator).toHaveAttribute('aria-valuenow', split!);
			}
		}
		await setSliderValue(page, 'Current time', 15);

		await expect(slider(page, 'Current time')).toHaveAttribute('aria-valuenow', '15');
		await slider(page, 'Repeat end').evaluate((el) => (el as HTMLElement).blur());
		await screenshotControls(page, testInfo.outputPath('close-handles.png'));

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
		await expect
			.poll(() => slider(page, 'Repeat end').getAttribute('aria-valuenow').then(Number))
			.toBeCloseTo(1 / 30, 8);
		await expect(page.getByRole('alert')).toHaveCount(0);
		await slider(page, 'Repeat start').press('ArrowRight');
		await expect(slider(page, 'Repeat end')).toHaveAttribute('aria-valuenow', '0.1');
		await expect(page.getByRole('alert')).toHaveCount(0);
		await identity(page);
	});

	for (const watch of [false, true]) {
		test(`video scrub ${watch ? 'watch' : 'editor'} previews, cancels, commits and preserves controls`, async ({
			page
		}, testInfo) => {
			if (!watch)
				await page.addInitScript(() => {
					const observer = new MutationObserver(() => {
						const box = document.querySelector('.timeline-box');
						if (!box || box.querySelector('.editor-axis')) return;
						Object.assign(window, { loadingTimelineHeight: box.getBoundingClientRect().height });
						observer.disconnect();
					});
					observer.observe(document, { childList: true, subtree: true });
				});
			await page.goto(
				watch
					? '/dt-SqNL4z3w/10~20.125?mute&fill=0'
					: '/?v=dt-SqNL4z3w&t=-50.25~-40.125&mute&fill=0'
			);
			const surface = page.locator('.video-surface');
			const display = watch ? page.getByRole('progressbar') : slider(page, 'Current time');
			await expect(display).toHaveAttribute('aria-valuemax', watch ? '10.125' : '60.25');
			if (!watch)
				expect(
					await page.evaluate(
						() => (window as unknown as { loadingTimelineHeight: number }).loadingTimelineHeight
					)
				).toBe(36);
			if (watch)
				await page
					.getByRole('button', { name: 'A:B progress, switch to full-video playback', exact: true })
					.click();
			await expect(display).toHaveAttribute('aria-valuemax', '60.25');
			const original = Number(await display.getAttribute('aria-valuenow'));
			if (!watch) {
				// The video edge belongs to taps and scrubbing, even beside the
				// splitter. Resizing remains available from the settings side.
				const video = (await surface.boundingBox())!;
				const separator = page.getByRole('separator', { name: 'Resize video preview' });
				const size = await separator.getAttribute('aria-valuenow');
				const edgeX = video.x + 2,
					edgeY = video.y + video.height / 2;
				await page.mouse.click(edgeX, edgeY);
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await expect(separator).toHaveAttribute('aria-valuenow', size!);
				await page.mouse.click(edgeX, edgeY);
				await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
				await page.mouse.move(edgeX, edgeY);
				await page.mouse.down();
				await page.mouse.move(edgeX + 10, edgeY);
				await page.mouse.up();
				await expect
					.poll(() => display.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo((12 / video.width) * 60.25, 1);
				await expect(separator).toHaveAttribute('aria-valuenow', size!);
				await setSliderValue(page, 'Current time', original);
				const divider = (await separator.boundingBox())!;
				await page.mouse.move(divider.x - 6, edgeY);
				await page.mouse.down();
				await page.mouse.move(divider.x - 16, edgeY);
				await expect(separator).not.toHaveAttribute('aria-valuenow', size!);
				await page.mouse.move(divider.x - 6, edgeY);
				await page.mouse.up();
				await expect(separator).toHaveAttribute('aria-valuenow', size!);
			}

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
			if (!watch) await expect.poll(() => time(page)).toBeCloseTo(targetTime, 1);
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
			if (!watch) expect(await time(page)).toBe(original);
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
				expect(Math.abs(line!.x + line!.width / 2 - dragX)).toBeLessThan(1);
				await expect(page.locator('.editor-playhead-line')).not.toHaveClass(/inside-clip/);
				await setSliderValue(page, 'Current time', 15);
				const combined = await page.evaluate(() => {
					const box = (selector: string) =>
						document.querySelector(selector)!.getBoundingClientRect();
					const color = (selector: string) =>
						getComputedStyle(document.querySelector(selector)!).backgroundColor;
					const axis = box('.editor-axis');
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
						markerTop: box('.endpoints .triangle-marker').top - axis.top,
						markerColors: [...document.querySelectorAll('.endpoints .triangle-body')].map(
							(el) => getComputedStyle(el).fill
						),
						summaryColors: [...document.querySelectorAll('.range-summary polygon')].map(
							(el) => getComputedStyle(el).fill
						),
						lineShadow: getComputedStyle(document.querySelector('.editor-playhead-line')!)
							.boxShadow,
						insets: [
							Math.abs(axis.left - box('.player').left),
							Math.abs(axis.right - box('.player').right)
						],
						heights: [
							axis.height,
							box('.endpoints .track').height,
							box('.endpoints .triangle-marker').height
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
				expect(combined.lineColor).toEqual([240, 120, 0]);
				expect(combined.lineShadow).toBe('none');
				expect(combined.markerTop).toBe(0);
				expect(combined.markerColors).toEqual(['rgb(38, 139, 210)', 'rgb(99, 102, 241)']);
				expect(combined.summaryColors).toEqual(combined.markerColors);
				expect(combined.insets.every((inset) => inset < 1)).toBe(true);
				expect(combined.heights).toEqual([20, 20, 20]);
				expect(combined.colors).toEqual([
					'rgb(170, 170, 170)',
					'rgb(255, 51, 51)',
					'rgb(255, 230, 109)',
					'rgb(240, 120, 0)'
				]);
				expect(combined.overlap).toBeCloseTo(5 / 10.125, 2);
				// VIDEO permits playback outside A:B; switching to A:B enters the
				// selected loop without changing endpoints or the provider.
				await expect(page.locator('.transport-options .transport-scope .scope-icon')).toHaveText(
					'A:B'
				);
				await expect(page.locator('.transport-scope')).toContainText('Clip Only');
				await setSliderValue(page, 'Current time', 30);
				await page.getByRole('button', { name: 'Play', exact: true }).click();
				await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
				await expect.poll(() => time(page)).toBeGreaterThanOrEqual(30);
				await page
					.getByRole('button', { name: 'VIDEO playback, switch to A:B playback', exact: true })
					.click();
				await expect.poll(() => time(page)).toBeLessThan(20.125);
				await page
					.getByRole('button', { name: 'A:B playback, switch to VIDEO playback', exact: true })
					.click();
				await page.getByRole('button', { name: 'Pause', exact: true }).click();
				await setSliderValue(page, 'Current time', 15);
				await slider(page, 'Current time').evaluate((el) => (el as HTMLElement).blur());
				await screenshotControls(page, testInfo.outputPath('combined-timeline.png'));
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
							.poll(
								async () =>
									await page.locator('.editor-playhead-line').evaluate((el) => {
										const box = el.getBoundingClientRect();
										return box.left + box.width / 2;
									})
							)
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
				expect(Math.abs(fullAxis.width - video.width)).toBeLessThan(1);
				expect((await page.locator('.media-canvas').boundingBox())!.width).toBeLessThan(
					video.width / 2
				);
				async function dragAt(cursor: number, theater = false) {
					const bounds = (await surface.boundingBox())!;
					await page.mouse.move(cursor - 12, bounds.y + bounds.height / 2);
					await page.mouse.down();
					if (theater) await expect(timeline).toBeHidden();
					await page.mouse.move(cursor, bounds.y + bounds.height / 2);
					if (theater) {
						await expect(timeline).toBeVisible();
						await expect(timeline).toHaveAttribute('aria-hidden', 'false');
						await expect(page.locator('.watch-controls')).toBeHidden();
					}
					await page.mouse.up();
					if (theater) await expect(timeline).toBeHidden();
				}
				const cursor = Math.round(fullAxis.x + fullAxis.width * 0.25);
				await dragAt(cursor);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(((cursor - fullAxis.x) / fullAxis.width) * 60.25, 1);
				const leftMargin = Math.round(video.x + 30);
				await dragAt(leftMargin);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(((leftMargin - fullAxis.x) / fullAxis.width) * 60.25, 1);
				const rightMargin = Math.round(video.x + video.width - 30);
				await dragAt(rightMargin);
				await expect
					.poll(() => timeline.getAttribute('aria-valuenow').then(Number))
					.toBeCloseTo(((rightMargin - fullAxis.x) / fullAxis.width) * 60.25, 1);
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
				const theaterVideo = (await surface.boundingBox())!;
				await page.mouse.move(clipCursor - 12, theaterVideo.y + theaterVideo.height / 2);
				await page.mouse.down();
				await page.mouse.move(clipCursor, theaterVideo.y + theaterVideo.height / 2);
				await expect(timeline).toBeVisible();
				await page.evaluate(() => window.dispatchEvent(new Event('blur')));
				await expect(timeline).toBeHidden();
				await expect(timeline).toHaveAttribute('aria-hidden', 'true');
				await page.mouse.up();
				await dragAt(leftMargin, true);
				await expect(timeline).toHaveAttribute('aria-valuenow', '0');
				await dragAt(clipCursor, true);
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
