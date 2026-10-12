import { test, expect, type Page } from '@playwright/test';

const id = 'dt-SqNL4z3w';
const storageKey = 'youloop.editor-workspace';
const divider = (page: Page) => page.getByRole('separator', { name: 'Resize video preview' });
const value = (page: Page) => divider(page).getAttribute('aria-valuenow').then(Number);

async function openEditor(page: Page) {
	await page.goto(`/?v=${id}&t=5-50&mute&speed=1.5&fill=0`);
	await expect(page.locator('.controls')).not.toHaveAttribute('inert');
	await page.waitForFunction(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & {
			duration: number;
			paused: boolean;
		};
		return media?.duration > 0 && media.paused && media.shadowRoot?.querySelector('iframe');
	});
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
				const workspace = document.querySelector('.editor-workspace')!.getBoundingClientRect();
				const canvas = document.querySelector('.media-canvas')!.getBoundingClientRect();
				const controls = document.querySelector('#editor-settings')!.getBoundingClientRect();
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
					document.querySelector('#editor-settings')!.scrollWidth <= controls.width + 1
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
	await page.getByRole('button', { name: 'Stacked', exact: true }).click();
	await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
	const before = await value(page);
	await handle.press('ArrowDown');
	expect(await value(page)).toBeGreaterThan(before);
	await dragBy(page, 40);
	await geometry(page);
	await page.getByRole('button', { name: 'Reset split' }).click();
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
		async () => page.getByRole('button', { name: 'Stacked', exact: true }).click(),
		async () => dragBy(page, -30),
		async () => page.setViewportSize({ width: 390, height: 844 }),
		async () => page.setViewportSize({ width: 844, height: 390 }),
		async () => page.setViewportSize({ width: 1280, height: 800 }),
		async () => page.getByRole('button', { name: 'Side by side' }).click(),
		async () => page.getByRole('button', { name: 'Reset split' }).click()
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
	await page.locator('#editor-settings').evaluate((el) => {
		const content = document.createElement('div');
		content.style.height = '1600px';
		el.append(content);
		el.scrollTop = 1000;
	});
	await geometry(page);
	await identity(page);
	expect(await page.locator('#editor-settings').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
	const afterScroll = await snapshot();
	expect(afterScroll.paused).toBe(false);
	expect(afterScroll.state).toBe(1);
	expect(afterScroll.time).toBeGreaterThanOrEqual(previousTime - 0.25);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	const pausedTime = (await snapshot()).time;
	await page.getByRole('button', { name: 'Stacked', exact: true }).click();
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
			await expect(page.getByRole('button', { name: 'Side by side' })).toBeDisabled();
		}
		for (const orientation of ['Portrait', 'Landscape']) {
			await page.getByRole('button', { name: orientation, exact: true }).click();
			for (let i = 0; i < 2; i++) {
				await page.getByRole('button', { name: 'Crop to fill' }).click();
				await geometry(page);
				await identity(page);
			}
		}
		await page.locator('#editor-settings').evaluate((el) => {
			const extra = document.createElement('div');
			extra.style.height = '1600px';
			el.prepend(extra);
		});
		const before = await page.locator('#editor-preview').boundingBox();
		const timelineBefore = await page.locator('.wrap-sliders').boundingBox();
		const transportBefore = await page.locator('.preview-actions').boundingBox();
		await page.locator('#editor-settings').hover();
		await page.mouse.wheel(0, 800);
		await expect
			.poll(() => page.locator('#editor-settings').evaluate((el) => el.scrollTop))
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
	await page.getByRole('button', { name: 'Stacked', exact: true }).click();
	await dragBy(page, 45);
	const saved = await value(page);
	const url = page.url();
	await page.reload();
	await expect(divider(page)).toHaveAttribute('aria-orientation', 'horizontal');
	await expect.poll(() => value(page)).toBe(saved);
	expect(page.url()).toBe(url);
	await page.getByRole('button', { name: 'Side by side' }).click();
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
	await page.getByRole('button', { name: 'Reset split' }).click();
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
		await page.getByRole('button', { name: 'Reset split' }).click();
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
		const settings = page.locator('#editor-settings');
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
		await expect(group.locator('button[aria-pressed="true"]')).toHaveCount(1);
		await expect(group.getByRole('button', { name: 'Reset split' })).not.toHaveAttribute(
			'aria-pressed'
		);
		expect(
			await group.locator('button').evaluateAll((buttons) =>
				buttons.every((button) => {
					const box = button.getBoundingClientRect();
					return (
						box.width >= 44 &&
						box.height >= 44 &&
						button.getAttribute('title') &&
						button.textContent?.trim() === ''
					);
				})
			)
		).toBe(true);
		if (viewport.width < 660) {
			const side = group.getByRole('button', { name: /Side by side/ });
			await expect(side).toBeDisabled();
			await expect(side).toHaveAttribute('title', /at least 660px/);
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
				const settings = document.querySelector('#editor-settings')!;
				const overlap = (a: DOMRect, b: DOMRect) =>
					a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
				return (
					brand.left >= picture.left &&
					brand.right <= picture.right &&
					brand.top >= picture.top &&
					brand.bottom <= picture.bottom &&
					!overlap(brand, timeline) &&
					pictureCenter?.classList.contains('video-toggle') &&
					parseFloat(getComputedStyle(settings).paddingLeft) >= 16 &&
					document.documentElement.scrollHeight <= innerHeight &&
					getComputedStyle(document.querySelector('.preview-brand')!).pointerEvents === 'none'
				);
			})
		).toBe(true);
		if (viewport.width === 1920) {
			await expect(preview.locator('.brand')).toBeVisible();
			await expect(preview.locator('.brand')).toHaveAttribute('href', '/');
			await expect(preview.locator('.brand')).toHaveAttribute('data-sveltekit-reload');
		} else if (viewport.width < 660) {
			await expect(preview.locator('.compact-brand')).toBeVisible();
			await expect(preview.locator('.brand')).toBeHidden();
		}
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
		await page.getByRole('button', { name: 'Reset split' }).click();
		await expect(group.locator('button[aria-pressed="true"]')).toHaveCount(1);
		await identity(page);
	});
}
