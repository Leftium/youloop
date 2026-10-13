import { test, expect, type Page } from '@playwright/test';
import { parsePlayerUrl, serializeEditorUrl } from '../../src/lib/share-url';

const id = 'dt-SqNL4z3w';
const storageKey = 'youloop.editor-workspace';
const divider = (page: Page) => page.getByRole('separator', { name: 'Resize video preview' });
async function chooseLayout(page: Page, layout: 'rows' | 'columns') {
	if ((await page.locator('.workspace-grid').getAttribute('data-layout')) === layout) return;
	await page
		.getByRole('button', {
			name: layout === 'rows' ? 'Switch to stacked layout' : 'Switch to side-by-side layout',
			exact: true
		})
		.click();
	await expect(page.locator('.workspace-grid')).toHaveAttribute('data-layout', layout);
}

const value = (page: Page) => divider(page).getAttribute('aria-valuenow').then(Number);

async function openEditor(page: Page, path = `/?v=${id}&t=5-50&mute&speed=1.5&fill=0`) {
	await page.goto(path);
	await expect(page.locator('.controls')).not.toHaveAttribute('inert');
	await page.waitForFunction(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & {
			duration: number;
			paused: boolean;
		};
		return media?.duration > 0 && media.paused && media.shadowRoot?.querySelector('iframe');
	});
	// The provider's first pause precedes settled duration and canonical sharing.
	await expect(
		page.getByRole('link', { name: 'Share URL', exact: true, includeHidden: true })
	).toHaveAttribute('href', /^http/, { timeout: 30_000 });
	const parsed = parsePlayerUrl(new URL(path, page.url()));
	if (parsed.ok)
		await expect(page).toHaveURL(new URL(serializeEditorUrl(parsed.value), page.url()).href);
	await page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		Object.assign(window, {
			workspaceMedia: media,
			workspaceFrame: media.shadowRoot!.querySelector('iframe'),
			workspaceEngine: media.engine
		});
	});
}

async function identity(page: Page) {
	expect(
		await page.evaluate(() => {
			const saved = window as unknown as {
				workspaceMedia: Element;
				workspaceFrame: Element;
				workspaceEngine: unknown;
			};
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			return (
				media === saved.workspaceMedia &&
				media.shadowRoot?.querySelector('iframe') === saved.workspaceFrame &&
				media.engine === saved.workspaceEngine
			);
		})
	).toBe(true);
	await expect(page.locator('youtube-video')).toHaveCount(1);
}

async function geometry(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const preview = document.querySelector('#editor-preview')!.getBoundingClientRect();
				const picture = document.querySelector('.player')!.getBoundingClientRect();
				const workspace = document.querySelector('.workspace-grid')!.getBoundingClientRect();
				const canvas = document.querySelector('.media-canvas')!.getBoundingClientRect();
				const controls = document.querySelector('.settings-pane')!.getBoundingClientRect();
				const ratio = Number(
					getComputedStyle(document.querySelector('.player')!).getPropertyValue('--media-ratio')
				);
				return (
					workspace.left === 0 &&
					workspace.top === 0 &&
					Math.abs(workspace.right - innerWidth) < 1 &&
					Math.abs(workspace.bottom - innerHeight) < 1 &&
					picture.height >= 100 &&
					preview.top >= 0 &&
					preview.bottom <= innerHeight + 1 &&
					preview.height >= 99 &&
					controls.height >= 109 &&
					controls.bottom <= innerHeight + 1 &&
					canvas.width > 0 &&
					canvas.height > 0 &&
					Math.abs(canvas.width / canvas.height - ratio) < 0.01 &&
					canvas.width <= preview.width + 1 &&
					canvas.height <= preview.height + 1 &&
					document.documentElement.scrollWidth <= innerWidth &&
					document.querySelector('.settings-scroll')!.scrollWidth <= controls.width + 1
				);
			})
		)
		.toBe(true);
}

async function dragBy(page: Page, delta: number) {
	const handle = divider(page);
	const box = (await handle.boundingBox())!;
	const columns = (await handle.getAttribute('aria-orientation')) === 'vertical';
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		box.x + box.width / 2 + (columns ? delta : 0),
		box.y + box.height / 2 + (columns ? 0 : delta),
		{ steps: 5 }
	);
	await page.mouse.up();
	await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
}

test('pointer and keyboard splitter bounds, capture cleanup, axes and reset', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openEditor(page);
	const handle = divider(page);
	await expect(handle).toHaveAttribute('aria-controls', 'editor-preview editor-settings');
	await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
	const initial = await value(page);
	await dragBy(page, 80);
	expect(Math.abs((await value(page)) - initial - 80)).toBeLessThanOrEqual(1);
	await handle.press('ArrowLeft');
	expect(Math.abs((await value(page)) - initial - 64)).toBeLessThanOrEqual(1);
	for (const key of ['Home', 'End']) {
		await handle.press(key);
		expect(await value(page)).toBe(
			Number(await handle.getAttribute(key === 'Home' ? 'aria-valuemin' : 'aria-valuemax'))
		);
		await geometry(page);
	}
	await dragBy(page, -2000);
	expect(await value(page)).toBe(Number(await handle.getAttribute('aria-valuemin')));
	await handle.focus();
	expect(await handle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
	for (const event of ['pointercancel', 'lostpointercapture']) {
		const box = (await handle.boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + 20);
		await page.mouse.down();
		await expect(page.locator('.workspace-grid')).toHaveClass(/dragging/);
		await handle.dispatchEvent(event, { pointerId: 1 });
		await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
		const before = await value(page);
		await page.mouse.move(box.x + 100, box.y + 20);
		await page.mouse.up();
		expect(await value(page)).toBe(before);
	}
	await chooseLayout(page, 'rows');
	await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
	const before = await value(page);
	await handle.press('ArrowDown');
	expect(await value(page)).toBeGreaterThan(before);
	await dragBy(page, 40);
	await geometry(page);
	await page.getByRole('button', { name: 'Restore default layout' }).click();
	await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
	expect(await value(page)).toBe(initial);
	const box = (await handle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + 20);
	await page.mouse.down();
	await expect(page.locator('.workspace-grid')).toHaveClass(/dragging/);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
	await page.mouse.up();
	await geometry(page);
	await identity(page);
});

test('playing YouTube provider and clip survive resize, layout, scroll and responsive reflow', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEditor(page);
	const originalUrl = page.url();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await page.waitForFunction(
		() =>
			(
				document.querySelector('youtube-video') as HTMLElement & {
					engine: { getPlayerState(): number };
				}
			).engine.getPlayerState() === 1
	);
	const snapshot = () =>
		page.locator('youtube-video').evaluate((el) => {
			const media = el as HTMLElement & {
				currentTime: number;
				paused: boolean;
				playbackRate: number;
				engine: { getPlayerState(): number };
			};
			return {
				time: media.currentTime,
				paused: media.paused,
				speed: media.playbackRate,
				state: media.engine.getPlayerState()
			};
		});
	let previousTime = (await snapshot()).time;
	for (const action of [
		async () => dragBy(page, -60),
		async () => chooseLayout(page, 'rows'),
		async () => dragBy(page, -30),
		async () => page.setViewportSize({ width: 390, height: 844 }),
		async () => page.setViewportSize({ width: 844, height: 390 }),
		async () => page.setViewportSize({ width: 1280, height: 800 }),
		async () => chooseLayout(page, 'columns'),
		async () => page.getByRole('button', { name: 'Restore default layout' }).click()
	]) {
		await action();
		await identity(page);
		await geometry(page);
		const state = await snapshot();
		expect(state.paused).toBe(false);
		expect(state.state).toBe(1);
		expect(state.speed).toBe(1.5);
		expect(state.time).toBeGreaterThanOrEqual(previousTime - 0.25);
		previousTime = state.time;
		expect(page.url()).toBe(originalUrl);
	}
	await page.locator('.settings-scroll').evaluate((el) => {
		const content = document.createElement('div');
		content.style.height = '1600px';
		el.append(content);
		el.scrollTop = 1000;
	});
	await geometry(page);
	await identity(page);
	expect(await page.locator('.settings-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	const afterScroll = await snapshot();
	expect(afterScroll.paused).toBe(false);
	expect(afterScroll.state).toBe(1);
	expect(afterScroll.time).toBeGreaterThanOrEqual(previousTime - 0.25);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	const pausedTime = (await snapshot()).time;
	await chooseLayout(page, 'rows');
	await dragBy(page, 30);
	await identity(page);
	expect((await snapshot()).paused).toBe(true);
	expect(Math.abs((await snapshot()).time - pausedTime)).toBeLessThan(0.5);
});

for (const viewport of [
	{ width: 320, height: 568 },
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test(`responsive preview, independent scrolling and Fit/Fill at ${viewport.width}x${viewport.height}`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openEditor(page);
		await geometry(page);
		if (viewport.width < 660) {
			await expect(divider(page)).toHaveAttribute('aria-orientation', 'horizontal');
			await expect(
				page.getByRole('button', { name: 'Switch to side-by-side layout' })
			).toBeDisabled();
		}
		for (const orientation of ['Portrait', 'Landscape']) {
			await page.getByRole('button', { name: orientation, exact: true }).click();
			for (let i = 0; i < 2; i++) {
				await page
					.getByRole('group', { name: 'Crop', exact: true })
					.getByRole('button', { name: 'Fill', exact: true })
					.click();
				await geometry(page);
				await identity(page);
			}
		}
		await page.locator('.settings-scroll').evaluate((el) => {
			const extra = document.createElement('div');
			extra.style.height = '1600px';
			el.prepend(extra);
		});
		const before = await page.locator('#editor-preview').boundingBox();
		const timelineBefore = await page.locator('.wrap-sliders').boundingBox();
		const transportBefore = await page.locator('.preview-actions').boundingBox();
		await page.locator('.settings-scroll').hover();
		await page.mouse.wheel(0, 800);
		await expect
			.poll(() => page.locator('.settings-scroll').evaluate((el) => el.scrollTop))
			.toBeGreaterThan(0);
		expect(await page.locator('#editor-preview').boundingBox()).toEqual(before);
		expect(await page.locator('.wrap-sliders').boundingBox()).toEqual(timelineBefore);
		expect(await page.locator('.preview-actions').boundingBox()).toEqual(transportBefore);
		await geometry(page);
		await identity(page);
	});
}

test('session preferences restore, reconcile on resize, reset and stay out of share URLs', async ({
	page,
	browser
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEditor(page);
	await chooseLayout(page, 'rows');
	await dragBy(page, 45);
	const saved = await value(page);
	const url = page.url();
	await page.reload();
	await expect(divider(page)).toHaveAttribute('aria-orientation', 'horizontal');
	await expect.poll(() => value(page)).toBe(saved);
	expect(page.url()).toBe(url);
	await chooseLayout(page, 'columns');
	await divider(page).press('End');
	await page.setViewportSize({ width: 700, height: 500 });
	await geometry(page);
	expect(await value(page)).toBeLessThanOrEqual(
		Number(await divider(page).getAttribute('aria-valuemax'))
	);
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(divider(page)).toHaveAttribute('aria-orientation', 'horizontal');
	await page.setViewportSize({ width: 1280, height: 800 });
	await expect(divider(page)).toHaveAttribute('aria-orientation', 'vertical');
	const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
	try {
		const other = await fresh.newPage();
		await other.goto(url);
		await expect(divider(other)).toHaveAttribute('aria-orientation', 'vertical');
		expect(await other.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
	} finally {
		await fresh.close();
	}
	await page.getByRole('button', { name: 'Restore default layout' }).click();
	expect(
		await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), storageKey)
	).toEqual({ layout: null, ratios: { columns: 0.62, rows: 0.55 } });
});

test('touch capture and cancellation clean up without changing provider identity', async ({
	browser
}) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		hasTouch: true
	});
	try {
		const page = await context.newPage();
		await openEditor(page);
		const before = await value(page);
		const box = (await divider(page).boundingBox())!;
		const cdp = await context.newCDPSession(page);
		const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
		await expect(page.locator('.workspace-grid')).toHaveClass(/dragging/);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [{ ...point, y: point.y + 40 }]
		});
		await expect.poll(() => value(page)).toBeGreaterThan(before);
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
		await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
		await identity(page);
		await geometry(page);
	} finally {
		await context.close();
	}
});

for (const storage of ['stale', 'blocked']) {
	test(`workspace stays usable with ${storage} session storage`, async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 568 });
		await page.addInitScript(
			({ key, storage }) => {
				if (storage === 'stale') {
					sessionStorage.setItem(
						key,
						JSON.stringify({ layout: 'rows', ratios: { rows: 1000, columns: -10 } })
					);
				} else {
					Storage.prototype.getItem = Storage.prototype.setItem = () => {
						throw new DOMException('Storage blocked', 'SecurityError');
					};
				}
			},
			{ key: storageKey, storage }
		);
		await openEditor(page);
		await geometry(page);
		if (storage === 'stale')
			expect(await value(page)).toBe(Number(await divider(page).getAttribute('aria-valuemax')));
		await divider(page).press('Home');
		await geometry(page);
		await page.getByRole('button', { name: 'Restore default layout' }).click();
		await geometry(page);
		await identity(page);
	});
}

for (const viewport of [
	{ width: 1920, height: 1080 },
	{ width: 320, height: 568 },
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test(`preview transport, branding and grouped layout fill viewport at ${viewport.width}x${viewport.height}`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await openEditor(page);
		await geometry(page);
		const preview = page.locator('#editor-preview');
		const settings = page.locator('.settings-scroll');
		await expect(preview.locator('.timestamps')).toHaveCount(1);
		await expect(preview.locator('.wrap-sliders')).toHaveCount(1);
		await expect(
			preview.getByRole('slider', { name: /Current time|Repeat start|Repeat end/ })
		).toHaveCount(3);
		await expect(
			settings.locator('.wrap-sliders,.timestamps,.workspace-layout,.preview-playback')
		).toHaveCount(0);
		await expect(page.locator('.workspace-toolbar')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /fullscreen/i })).toHaveCount(0);
		const group = preview.getByRole('group', { name: 'Workspace layout' });
		await expect(group.locator('button')).toHaveCount(1);
		await expect(group.locator('button')).not.toHaveAttribute('aria-pressed');
		await expect(
			settings.getByRole('button', { name: 'Restore default layout' })
		).not.toHaveAttribute('aria-pressed');
		expect(
			await group.locator('button').evaluateAll((buttons) =>
				buttons.every((button) => {
					const box = button.getBoundingClientRect();
					return (
						box.width >= 44 &&
						box.height >= 44 &&
						button.getAttribute('data-tooltip') &&
						button.getAttribute('aria-label')
					);
				})
			)
		).toBe(true);
		if (viewport.width < 660) {
			const side = group.getByRole('button', { name: 'Switch to side-by-side layout' });
			await expect(side).toBeDisabled();
			await expect(side).toHaveAttribute('data-tooltip', 'Side by side requires at least 660px');
			await expect(page.locator('#layout-unavailable')).toContainText('at least 660px');
		}
		await expect(preview.locator('.preview-brand')).toContainText('YouLoop');
		await expect(preview.locator('.preview-brand img:visible')).toHaveAttribute('src', '/logo.svg');
		await expect(page.locator('.editor-page > nav')).toHaveCount(0);
		expect(
			await preview.evaluate((preview) => {
				const picture = preview.querySelector('.player')!.getBoundingClientRect();
				const brand = preview.querySelector('.preview-brand')!.getBoundingClientRect();
				const timeline = preview.querySelector('.wrap-sliders')!.getBoundingClientRect();
				const pictureCenter = document.elementFromPoint(
					picture.left + picture.width / 2,
					picture.top + picture.height / 2
				);
				const settings = document.querySelector('.settings-scroll')!;
				const overlap = (a: DOMRect, b: DOMRect) =>
					a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
				return (
					brand.left >= preview.getBoundingClientRect().left &&
					brand.right <= preview.getBoundingClientRect().right &&
					brand.top >= preview.getBoundingClientRect().top &&
					brand.bottom <= picture.bottom &&
					picture.top === preview.getBoundingClientRect().top &&
					!overlap(brand, timeline) &&
					pictureCenter?.classList.contains('video-toggle') &&
					parseFloat(getComputedStyle(settings).paddingLeft) >= 16 &&
					document.documentElement.scrollHeight <= innerHeight
				);
			})
		).toBe(true);
		if (viewport.width === 1920) {
			await expect(preview.locator('.brand')).toBeVisible();
			await expect(preview.locator('.brand')).toHaveAttribute('href', '/');
			await expect(preview.locator('.brand')).toHaveAttribute('data-sveltekit-reload');
		} else if (viewport.width < 660) {
			await expect(preview.locator('.brand')).toBeVisible();
		}
		await page.screenshot({
			path: `/tmp/youloop-pr38-overlay-${viewport.width}x${viewport.height}.png`
		});
		await preview.getByRole('button', { name: 'Play video', exact: true }).click();
		await page.waitForFunction(
			() =>
				(
					document.querySelector('youtube-video') as HTMLElement & {
						engine: { getPlayerState(): number };
					}
				).engine.getPlayerState() === 1
		);
		await preview.getByRole('button', { name: 'Pause video', exact: true }).click();
		const start = preview.getByRole('slider', { name: 'Repeat start', exact: true });
		await start.focus();
		await start.press('ArrowRight');
		await expect(start).toHaveValue('5.1');
		const url = page.url();
		const box = (await divider(page).boundingBox())!;
		const columns = (await divider(page).getAttribute('aria-orientation')) === 'vertical';
		const x = box.x + box.width / 2 + (columns ? -10 : 0);
		const y = box.y + box.height / 2 + (columns ? 0 : -10);
		expect(columns ? box.width : box.height).toBe(3);
		// Hit the transparent extension, outside the visible 3px line.
		expect(
			await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('role'), {
				x,
				y
			})
		).toBe('separator');
		await page.mouse.move(x, y);
		await page.mouse.down();
		await expect(page.locator('.workspace-grid')).toHaveClass(/dragging/);
		await page.mouse.move(x + (columns ? 30 : 0), y + (columns ? 0 : 30));
		await page.mouse.up();
		await geometry(page);
		await identity(page);
		expect(page.url()).toBe(url);
		// Padded action targets remain outside the divider's expanded hit area.
		await page.getByRole('button', { name: 'Restore default layout' }).click();
		await expect(group.locator('button')).toHaveCount(1);
		await expect(group.locator('button')).not.toHaveAttribute('aria-pressed');
		await identity(page);
	});
}

test.describe('mobile pane scrolling', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	const rootOffset = (page: Page) => page.evaluate(() => scrollY);
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	]) {
		test.describe(`${viewport.width}x${viewport.height}`, () => {
			test.use({ viewport, screen: viewport });
			test(`touch splitter owns both drag directions without document scrolling at ${viewport.width}x${viewport.height}`, async ({
				page,
				context
			}) => {
				await openEditor(page);
				await geometry(page);
				const url = page.url();
				await page.getByRole('button', { name: 'Play', exact: true }).click();
				await page.waitForFunction(
					() =>
						(
							document.querySelector('youtube-video') as HTMLElement & {
								engine: { getPlayerState(): number };
							}
						).engine.getPlayerState() === 1
				);
				const time = await page
					.locator('youtube-video')
					.evaluate((el) => (el as HTMLElement & { currentTime: number }).currentTime);
				const cdp = await context.newCDPSession(page);
				await expect(divider(page)).toHaveCSS('touch-action', 'none');
				for (const delta of [25, -25, 25, -25]) {
					const before = await value(page);
					const offset = await rootOffset(page);
					const box = (await divider(page).boundingBox())!;
					const columns = viewport.width > viewport.height;
					const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
					await expect(page.locator('.workspace-grid')).toHaveClass(/dragging/);
					for (let step = 1; step <= 6; step++) {
						await cdp.send('Input.dispatchTouchEvent', {
							type: 'touchMove',
							touchPoints: [
								{
									x: start.x + (columns ? (delta * step) / 6 : 0),
									y: start.y + (columns ? 0 : (delta * step) / 6)
								}
							]
						});
					}
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
					await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
					expect(Math.abs((await value(page)) - before - delta)).toBeLessThanOrEqual(1);
					expect(await rootOffset(page)).toBe(offset);
					await geometry(page);
					await identity(page);
				}
				expect(
					await page.locator('youtube-video').evaluate((el) => {
						const media = el as HTMLElement & {
							paused: boolean;
							playbackRate: number;
							currentTime: number;
						};
						return !media.paused && media.playbackRate === 1.5 && media.currentTime;
					})
				).toBeGreaterThanOrEqual(time);
				expect(page.url()).toBe(url);
			});
		});
	}

	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	]) {
		test.describe(`${viewport.width}x${viewport.height}`, () => {
			test.use({ viewport, screen: viewport });
			test(`settings scroll independently; picture swipes scroll the document without changing playback at ${viewport.width}x${viewport.height}`, async ({
				page,
				context
			}) => {
				await openEditor(page);
				await page.locator('.settings-scroll').evaluate((el) => {
					const tall = document.createElement('div');
					tall.style.height = '1200px';
					el.prepend(tall);
					el.scrollTop = 0;
				});
				const cdp = await context.newCDPSession(page);
				async function swipe(x: number, from: number, to: number) {
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchStart',
						touchPoints: [{ x, y: from }]
					});
					await page.waitForTimeout(50);
					for (let step = 1; step <= 6; step++) {
						await cdp.send('Input.dispatchTouchEvent', {
							type: 'touchMove',
							touchPoints: [{ x, y: from + ((to - from) * step) / 6 }]
						});
						await page.waitForTimeout(30);
					}
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
					await page.waitForTimeout(300); // Let native scroll momentum settle before comparing ownership.
				}
				const settings = page.locator('.settings-scroll');
				await geometry(page);
				const box = (await settings.boundingBox())!;
				await swipe(box.x + box.width / 2, box.y + box.height - 20, box.y + 20);
				await expect.poll(() => settings.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
				await expect(settings).toHaveCSS('overflow-y', 'auto');
				for (const bottom of [true, false]) {
					await settings.evaluate((el, bottom) => {
						el.scrollTop = bottom ? el.scrollHeight : 0;
					}, bottom);
					await swipe(
						box.x + box.width / 2,
						bottom ? box.y + box.height - 20 : box.y + 20,
						bottom ? box.y + 20 : box.y + box.height - 20
					);
					expect(await rootOffset(page)).toBe(0);
					await geometry(page);
				}
				const picture = (await page.locator('.player').boundingBox())!;
				const paneOffset = await settings.evaluate((el) => el.scrollTop);
				for (const reverse of [false, true]) {
					await swipe(
						picture.x + picture.width / 2,
						reverse ? picture.y + 20 : picture.y + picture.height - 20,
						reverse ? picture.y + picture.height - 20 : picture.y + 20
					);
					if (!reverse) expect(await rootOffset(page)).toBeGreaterThan(0);
					expect(await settings.evaluate((el) => el.scrollTop)).toBe(paneOffset);
					await expect
						.poll(() =>
							page
								.locator('youtube-video')
								.evaluate((el) => (el as HTMLElement & { paused: boolean }).paused)
						)
						.toBe(true);
					await identity(page);
				}
				expect(
					await page.evaluate(
						() =>
							document.documentElement.scrollHeight > innerHeight &&
							document.documentElement.scrollWidth <= innerWidth
					)
				).toBe(true);
			});
		});
	}
});

test.describe('automatic mobile document scrolling', () => {
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	]) {
		test.describe(`${viewport.width}x${viewport.height}`, () => {
			test.use({ hasTouch: true, isMobile: true, viewport, screen: viewport });
			test('video scrolls the document while settings, splitter and live provider stay independent', async ({
				page,
				context
			}) => {
				await openEditor(page);
				await expect(page.locator('.editor-workspace')).toHaveClass(/video-scroll/);
				await expect(page.getByRole('checkbox', { name: /experimental|diagnostic/i })).toHaveCount(
					0
				);
				await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
				await expect(page.locator('.settings-scroll')).toHaveCSS('scroll-snap-type', 'none');
				expect(
					await page
						.locator('.document-snap-point')
						.nth(1)
						.evaluate(
							(el) =>
								el.getBoundingClientRect().top -
								document.querySelector('.document-snap-point')!.getBoundingClientRect().top
						)
				).toBe(20);
				await expect(page.locator('.scroll-debug')).toHaveCount(0);
				const url = page.url();
				const offset = () => page.evaluate(() => scrollY);
				async function pinned() {
					await expect
						.poll(() =>
							page.evaluate(() => {
								const grid = document.querySelector('.workspace-grid')!.getBoundingClientRect();
								const preview = document.querySelector('#editor-preview')!.getBoundingClientRect();
								const timeline = document.querySelector('.wrap-sliders')!.getBoundingClientRect();
								const settings = document.querySelector('.settings-scroll')!;
								const pane = settings.getBoundingClientRect();
								const edge = document.querySelector('.settings-edge')!;
								const divider = edge.getBoundingClientRect();
								return (
									Math.abs(grid.top) <= 1 &&
									Math.abs(grid.bottom - innerHeight) <= 1 &&
									preview.top >= 0 &&
									preview.bottom <= innerHeight + 1 &&
									timeline.top >= preview.top &&
									timeline.bottom <= preview.bottom &&
									pane.top >= 0 &&
									pane.bottom <= innerHeight + 1 &&
									getComputedStyle(settings).overflowY === 'auto' &&
									(innerHeight > innerWidth
										? Math.abs(divider.bottom - innerHeight) <= 1 &&
											divider.height === 1 &&
											Math.abs(divider.left - pane.left) <= 1 &&
											Math.abs(divider.right - pane.right) <= 1 &&
											getComputedStyle(edge).pointerEvents === 'none'
										: getComputedStyle(edge).display === 'none') &&
									document.documentElement.scrollWidth <= innerWidth
								);
							})
						)
						.toBe(true);
					await identity(page);
				}
				await pinned();
				if (viewport.height > viewport.width) {
					// Chromium has no Safari toolbar. Model a 120px lvh-svh gap
					// and prove both sharing and the final controls clear the overlay.
					expect(
						await page.locator('.settings-pane').evaluate((el) => {
							const pane = el as HTMLElement;
							pane.style.setProperty('--browser-chrome-reserve', '120px');
							const scroll = pane.querySelector('.settings-scroll')!;
							scroll.scrollTop = scroll.scrollHeight;
							const footer = pane.querySelector('.settings-footer')!.getBoundingClientRect();
							const controls = scroll.lastElementChild!.getBoundingClientRect();
							const clearance = innerHeight - Math.max(footer.bottom, controls.bottom);
							pane.style.removeProperty('--browser-chrome-reserve');
							scroll.scrollTop = 0;
							return clearance;
						})
					).toBeGreaterThanOrEqual(120);
					await identity(page);
				}
				await page.locator('.settings-scroll').evaluate((el) => {
					const tall = document.createElement('div');
					tall.style.height = '1400px';
					el.prepend(tall);
					el.scrollTop = 0;
				});
				const cdp = await context.newCDPSession(page);
				async function swipe(x: number, y: number, dx: number, dy: number) {
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchStart',
						touchPoints: [{ x, y }]
					});
					await page.waitForTimeout(50);
					for (let step = 1; step <= 8; step++) {
						await cdp.send('Input.dispatchTouchEvent', {
							type: 'touchMove',
							touchPoints: [{ x: x + (dx * step) / 8, y: y + (dy * step) / 8 }]
						});
						await page.waitForTimeout(30);
					}
					await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
					await page.waitForTimeout(400);
				}
				const settings = page.locator('.settings-scroll');
				const pane = (await settings.boundingBox())!;
				await swipe(pane.x + pane.width / 2, pane.y + pane.height - 25, 0, -120);
				await expect.poll(() => settings.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
				expect(await offset()).toBe(0);
				await pinned();
				await settings.evaluate((el) => {
					el.scrollTop = 0;
				});
				const picture = (await page.locator('.player').boundingBox())!;
				await swipe(picture.x + picture.width / 4, picture.y + picture.height - 25, 0, -80);
				await expect.poll(offset).toBeGreaterThan(0);
				expect(await settings.evaluate((el) => el.scrollTop)).toBe(0);
				expect(
					await page
						.locator('youtube-video')
						.evaluate((el) => (el as HTMLElement & { paused: boolean }).paused)
				).toBe(true);
				await pinned();
				const root = await offset();
				for (const bottom of [true, false]) {
					await settings.evaluate((el, bottom) => {
						el.scrollTop = bottom ? el.scrollHeight : 0;
					}, bottom);
					await swipe(
						pane.x + pane.width / 2,
						bottom ? pane.y + pane.height - 25 : pane.y + 25,
						0,
						bottom ? -100 : 100
					);
					expect(await offset()).toBe(root);
					await pinned();
				}
				await page.getByRole('button', { name: 'Play', exact: true }).click();
				await page.waitForFunction(
					() =>
						(
							document.querySelector('youtube-video') as HTMLElement & {
								engine: { getPlayerState(): number };
							}
						).engine.getPlayerState() === 1
				);
				const started = await page
					.locator('youtube-video')
					.evaluate((el) => (el as HTMLElement & { currentTime: number }).currentTime);
				for (const delta of [20, -20, 20, -20]) {
					const box = (await divider(page).boundingBox())!;
					const before = await value(page);
					const columns = viewport.width > viewport.height;
					await swipe(
						box.x + box.width / 2,
						box.y + box.height / 2,
						columns ? delta : 0,
						columns ? 0 : delta
					);
					expect(Math.abs((await value(page)) - before - delta)).toBeLessThanOrEqual(1);
					expect(await offset()).toBe(root);
					await expect(page.locator('.workspace-grid')).not.toHaveClass(/dragging/);
					await pinned();
				}
				// Test runway extension independently of the snap-stop distance limit.
				const settingsBeforeExtensions = await settings.evaluate((el) => el.scrollTop);
				// Jump the root for geometry-only runway coverage; native picture swipe
				// ownership was checked above. This does not test Safari toolbar collapse.
				for (let extension = 0; extension < 3; extension++) {
					const beforeOffset = await offset();
					const before = await page
						.locator('.video-scroll-runway')
						.evaluate((el) => el.getBoundingClientRect().height);
					await page.evaluate((distance) => scrollTo(0, scrollY + distance), 25 * viewport.height);
					await expect
						.poll(() =>
							page
								.locator('.video-scroll-runway')
								.evaluate((el) => el.getBoundingClientRect().height)
						)
						.toBeGreaterThan(before);
					await expect
						.poll(() =>
							page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)
						)
						.toBeGreaterThan(9 * viewport.height);
					expect(await offset()).toBeGreaterThan(beforeOffset + 20 * viewport.height);
					expect(await settings.evaluate((el) => el.scrollTop)).toBe(settingsBeforeExtensions);
					await pinned();
				}
				const grown = await page
					.locator('.video-scroll-runway')
					.evaluate((el) => el.getBoundingClientRect().height);
				// Approximate toolbar-driven viewport expansion; physical Safari must
				// confirm actual viewport-unit updates. The complete grid must fill the new height.
				const preferences = await page.evaluate((key) => sessionStorage.getItem(key), storageKey);
				await page.setViewportSize({ width: viewport.width, height: viewport.height + 120 });
				await pinned();
				expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBe(
					preferences
				);
				expect(
					await page
						.locator('.video-scroll-runway')
						.evaluate((el) => el.getBoundingClientRect().height)
				).toBeGreaterThanOrEqual(grown);
				await page.setViewportSize(viewport);
				await pinned();
				await expect(settings).toHaveCSS('overscroll-behavior-y', 'none');

				if (viewport.width > viewport.height) {
					await chooseLayout(page, 'rows');
					await pinned();
					await chooseLayout(page, 'columns');
					await pinned();
				}
				// A wide portrait viewport must limit the edge divider to the columns controls pane.
				await page.setViewportSize({ width: 844, height: 1000 });
				await pinned();
				await page.setViewportSize({ width: 1280, height: 800 });
				await expect(page.locator('.editor-workspace')).not.toHaveClass(/video-scroll/);
				await geometry(page);
				await page.setViewportSize(viewport);
				await expect(page.locator('.editor-workspace')).toHaveClass(/video-scroll/);
				await pinned();
				expect(
					await page.locator('youtube-video').evaluate((el) => {
						const media = el as HTMLElement & {
							paused: boolean;
							currentTime: number;
							playbackRate: number;
						};
						return !media.paused && media.playbackRate === 1.5 && media.currentTime;
					})
				).toBeGreaterThanOrEqual(started);
				expect(page.url()).toBe(url);
				await page.getByRole('button', { name: 'Restore default layout', exact: true }).click();
				await expect(page.locator('.editor-workspace')).toHaveClass(/video-scroll/);
				await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
				await geometry(page);
				await identity(page);
				await page.reload();
				await expect(page.locator('.editor-workspace')).toHaveClass(/video-scroll/);
				await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
			});
		});
	}
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test.describe(`short controls ${viewport.width}x${viewport.height}`, () => {
		test.use({ hasTouch: true, isMobile: true, viewport, screen: viewport });
		test('fitting controls retain gesture ownership and provider identity', async ({
			page,
			context
		}) => {
			await openEditor(page);
			// Model a controls section whose real content fits without replacing media.
			await page.addStyleTag({ content: '.settings-content > * { display: none !important; }' });
			const pane = page.locator('.settings-scroll');
			expect(await pane.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
			expect(await pane.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(2);
			const box = (await pane.boundingBox())!;
			const cdp = await context.newCDPSession(page);
			for (const direction of [-1, 1, -1]) {
				const x = box.x + box.width / 2;
				const y = box.y + box.height / 2;
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
				await page.waitForTimeout(50);
				for (let step = 1; step <= 6; step++) {
					await cdp.send('Input.dispatchTouchEvent', {
						type: 'touchMove',
						touchPoints: [{ x, y: y + direction * step * 10 }]
					});
					await page.waitForTimeout(30);
				}
				await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
				await page.waitForTimeout(300);
				expect(await page.evaluate(() => scrollY)).toBe(0);
				await identity(page);
				await expect
					.poll(() =>
						page
							.locator('youtube-video')
							.evaluate((el) => (el as HTMLElement & { paused: boolean }).paused)
					)
					.toBe(true);
			}
		});
	});
}

test('layout stays in the upper-left over picture without reserving height through resize, reflow and settings scroll', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEditor(page);
	const position = async () => {
		const result = await page.locator('#editor-preview').evaluate((preview) => {
			const pane = preview.getBoundingClientRect();
			const group = preview.querySelector('.workspace-layout')!.getBoundingClientRect();
			const brand = preview.querySelector('.brand')!.getBoundingClientRect();
			const picture = preview.querySelector('.player')!.getBoundingClientRect();
			return {
				x: group.left - pane.left,
				y: group.top - pane.top,
				clear:
					group.top >= picture.top &&
					group.bottom <= picture.bottom &&
					brand.bottom <= picture.bottom &&
					picture.top === preview.getBoundingClientRect().top &&
					group.right <= brand.left
			};
		});
		expect(result.clear).toBe(true);
		return { x: result.x, y: result.y };
	};
	const original = await position();
	for (const action of [
		async () => chooseLayout(page, 'rows'),
		async () => dragBy(page, -30),
		async () => page.setViewportSize({ width: 320, height: 568 }),
		async () =>
			page.locator('.settings-scroll').evaluate((el) => {
				el.scrollTop = 1000;
			}),
		async () => page.setViewportSize({ width: 844, height: 390 }),
		async () => page.getByRole('button', { name: 'Restore default layout' }).click(),
		async () => page.setViewportSize({ width: 1280, height: 800 })
	]) {
		await action();
		await expect.poll(position).toEqual(original);
		await identity(page);
	}
});

test('named bound actions respect precision, retain Once, and share direct speed state', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEditor(page);
	await page.getByRole('button', { name: 'Once', exact: true }).click();
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await page.getByRole('checkbox', { name: 'Sub-second times' }).check();
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await page.getByRole('slider', { name: 'Current time', exact: true }).fill('12.5');
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await page.getByRole('button', { name: 'Set start at playhead' }).press('Enter');
	await expect(
		page.getByRole('slider', { name: 'Repeat start', exact: true, includeHidden: true })
	).toHaveValue('12.5');
	await expect(page.getByRole('button', { name: 'Edit start from start', exact: true })).toHaveText(
		'0:12.5'
	);
	await expect(page).toHaveURL(/t=12\.5~50.*once/);
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await page.getByRole('slider', { name: 'Current time', exact: true }).fill('30.5');
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await page.getByRole('button', { name: 'Set end at playhead' }).click();
	await expect(
		page.getByRole('slider', { name: 'Repeat end', exact: true, includeHidden: true })
	).toHaveValue('30.5');
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await page.getByRole('slider', { name: 'Repeat start', exact: true }).fill('15.25');
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit start from start', exact: true })).toHaveText(
		'0:15.25'
	);
	await expect(page).toHaveURL(/t=15\.25~30\.5.*once/);
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await expect(
		page.getByRole('button', { name: 'Once', exact: true, includeHidden: true })
	).toHaveAttribute('aria-pressed', 'true');
	await divider(page).press('End');
	await geometry(page);
	await identity(page);
	const cycle = page.getByRole('button', { name: /^Cycle playback speed/ });
	await page.getByRole('button', { name: '1x speed', exact: true }).click();
	await cycle.click();
	await expect(page.getByRole('button', { name: '0.5x speed', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	for (const rate of [2, 1, 0.5, 0.25]) {
		const speed = page.getByRole('button', { name: `${rate}x speed`, exact: true });
		await speed.click();
		await expect(speed).toHaveAttribute('aria-pressed', 'true');
		await expect(cycle).toContainText(`${rate}x`);
		await expect
			.poll(() =>
				page
					.locator('youtube-video')
					.evaluate((el) => (el as HTMLElement & { playbackRate: number }).playbackRate)
			)
			.toBe(rate);
		await identity(page);
	}
});

test('destination layout icon, tooltip and name follow keyboard switches and responsive constraints', async ({
	page
}) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEditor(page);
	const toggle = page.locator('.workspace-layout button');
	const url = page.url();
	const checkDestination = async (columns: boolean) => {
		const action = columns ? 'Switch to stacked layout' : 'Switch to side-by-side layout';
		await expect(toggle).toHaveAttribute('aria-label', action);
		await expect(toggle).not.toHaveAttribute('title');
		await expect(toggle).toHaveAttribute(
			'data-tooltip',
			(await page.viewportSize())!.width < 660 ? 'Side by side requires at least 660px' : action
		);
		await expect(toggle).not.toHaveAttribute('aria-pressed');
		await expect(toggle.locator('.columns-icon')).toHaveCount(columns ? 0 : 1);
		expect(await toggle.textContent()).toBe('');
		const box = (await toggle.boundingBox())!;
		expect(box.width).toBeGreaterThanOrEqual(44);
		expect(box.height).toBeGreaterThanOrEqual(44);
	};
	await checkDestination(true);
	await toggle.hover();
	await toggle.press('Enter');
	await checkDestination(false);
	await expect(toggle).toBeFocused();
	expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
	await toggle.press('Space');
	await checkDestination(true);
	await page.setViewportSize({ width: 390, height: 844 });
	await checkDestination(false);
	await expect(toggle).toBeDisabled();
	await page.setViewportSize({ width: 844, height: 390 });
	await checkDestination(true);
	await expect(toggle).toBeEnabled();
	await identity(page);
	expect(page.url()).toBe(url);
});

test('layout action accepts touch and reset lives only in settings', async ({ browser }) => {
	const context = await browser.newContext({
		hasTouch: true,
		viewport: { width: 844, height: 390 }
	});
	const page = await context.newPage();
	try {
		await openEditor(page);
		await page.getByRole('button', { name: 'Switch to stacked layout', exact: true }).tap();
		await expect(page.locator('.workspace-grid')).toHaveAttribute('data-layout', 'rows');
		await expect(
			page.getByRole('button', { name: 'Switch to side-by-side layout', exact: true })
		).toHaveAttribute('data-tooltip', 'Switch to side-by-side layout');
		await expect(
			page.locator('#editor-preview').getByRole('button', { name: 'Restore default layout' })
		).toHaveCount(0);
		await page
			.locator('.settings-scroll')
			.getByRole('button', { name: 'Restore default layout' })
			.tap();
		await expect(page.locator('.workspace-grid')).toHaveAttribute('data-layout', 'columns');
		await identity(page);
	} finally {
		await context.close();
	}
});

test('compact bounds retain signed fractions and refresh after source navigation', async ({
	page
}) => {
	await openEditor(page, `/?v=${id}&t=-30.5~-5.25&once&mute`);
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: 'Sub-second times' })).not.toBeChecked();
	await page.getByRole('checkbox', { name: 'Sub-second times' }).check();
	await expect(page.getByRole('button', { name: 'Edit end from end', exact: true })).toHaveText(
		'(-0:05.25)'
	);
	const duration = Number(
		await page
			.getByRole('slider', { name: 'Current time', exact: true, includeHidden: true })
			.getAttribute('max')
	);
	const start = Math.floor(duration) - 20.5;
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await page.getByRole('slider', { name: 'Current time', exact: true }).fill(String(start));
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await page.getByRole('button', { name: 'Set start at playhead' }).click();
	expect(new URL(page.url()).searchParams.get('t')).toBe(`${start}~-5.25`);
	await expect(
		page.getByRole('button', { name: 'Once', exact: true, includeHidden: true })
	).toHaveAttribute('aria-pressed', 'true');
	await identity(page);
	const lastValidUrl = page.url();
	await page
		.getByRole('dialog', { name: 'Edit clip range' })
		.getByRole('button', { name: 'Close clip range', exact: true })
		.click();
	await page.getByRole('slider', { name: 'Repeat end', exact: true }).fill('5.75');
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await expect(
		page.getByRole('link', { name: 'Share URL', exact: true, includeHidden: true })
	).toHaveCount(0);
	expect(page.url()).toBe(lastValidUrl);
	await identity(page);
	await openEditor(page, '/?v=M7lc1UVf-VE&t=2.5~8.75&once&mute');
	await page.getByRole('button', { name: 'Edit clip range', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Edit start from start', exact: true })).toHaveText(
		'0:03'
	);
	await expect(page.getByRole('button', { name: 'Edit end from start', exact: true })).toHaveText(
		'0:09'
	);
});
