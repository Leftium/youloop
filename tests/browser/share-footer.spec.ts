import { expect, type Page } from '@playwright/test';
import { test, browserOrigin } from './youtube-api.fixture';

const id = 'dt-SqNL4z3w';
const range = '-30.512345~-5.251234';
const query = 'once&mute&speed=1.5&vertical=0&fill=0&mirror';
const destination = `${browserOrigin}/${id}/${range}?${query}`;
const share = (page: Page) => page.getByRole('link', { name: 'Share URL', exact: true });

async function open(page: Page) {
	await page.goto(`/?v=${id}&t=${range}&${query}`);
	await expect(share(page)).toHaveAttribute('href', destination, { timeout: 30_000 });
	await page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		Object.assign(window, {
			footerMedia: media,
			footerEngine: media.engine,
			footerFrame: media.shadowRoot!.querySelector('iframe')
		});
	});
}

async function geometry(page: Page) {
	return page.evaluate(() => {
		const pane = document.querySelector('.settings-pane')!;
		const scroll = document.querySelector('.settings-scroll')!;
		const footer = document.querySelector('.settings-footer')!;
		const link = footer.querySelector('a')!;
		const label = footer.querySelector('.share-label')!;
		const p = pane.getBoundingClientRect();
		const s = scroll.getBoundingClientRect();
		const f = footer.getBoundingClientRect();
		const a = link.getBoundingClientRect();
		const l = label.getBoundingClientRect();
		const text = link.querySelector('bdi')!.firstChild!;
		// Verify the trailing punctuation is in LTR order and inside the clipping box.
		const suffix = document.createRange();
		suffix.setStart(text, text.textContent!.length - 18);
		suffix.setEnd(text, text.textContent!.length);
		const tail = suffix.getBoundingClientRect();
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		const saved = window as unknown as {
			footerMedia: Element;
			footerEngine: unknown;
			footerFrame: Element;
		};
		return {
			pinned: Math.abs(f.bottom - p.bottom + parseFloat(getComputedStyle(pane).paddingBottom)) < 1,
			separate: s.bottom <= f.top + 1 && !scroll.contains(footer),
			oneline: Math.abs(l.top + l.height / 2 - a.top - a.height / 2) < 1,
			fits:
				pane.scrollWidth <= pane.clientWidth &&
				f.right <= innerWidth &&
				f.bottom <= innerHeight + 1,
			tailVisible: tail.left >= a.left && tail.right <= a.right + 1,
			clipped: link.scrollWidth > link.clientWidth,
			href: link.href,
			identity:
				media === saved.footerMedia &&
				media.engine === saved.footerEngine &&
				media.shadowRoot!.querySelector('iframe') === saved.footerFrame,
			top: f.top
		};
	});
}

test('footer stays pinned through scroll, narrow widths, layouts and splitter changes @routine', async ({
	page,
	browserName
}, testInfo) => {
	await open(page);
	await expect(page.getByRole('button', { name: 'Copy Link', exact: true })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveCount(0);
	for (const viewport of [
		{ width: 1280, height: 800 },
		{ width: 700, height: 500 },
		{ width: 320, height: 568 },
		{ width: 240, height: 568 },
		{ width: 844, height: 390 }
	]) {
		await page.setViewportSize(viewport);
		await expect
			.poll(async () => {
				const state = await geometry(page);
				return (
					state.pinned &&
					state.separate &&
					state.oneline &&
					state.fits &&
					state.tailVisible &&
					state.identity
				);
			})
			.toBe(true);
		const before = await geometry(page);
		await page.locator('.settings-scroll').evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await expect.poll(async () => (await geometry(page)).top).toBe(before.top);
		await expect(share(page)).toHaveText(destination);
		expect((await geometry(page)).href).toBe(destination);
		const screenshot = `/tmp/youloop-share-footer-${browserName}-${viewport.width}.png`;
		await page.screenshot({ path: screenshot });
		await testInfo.attach(`footer-${viewport.width}`, {
			path: screenshot,
			contentType: 'image/png'
		});
	}
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.getByRole('button', { name: 'Switch to stacked layout', exact: true }).click();
	const separator = page.getByRole('separator', { name: 'Resize video preview' });
	await separator.press('ArrowDown');
	await expect.poll(async () => (await geometry(page)).pinned).toBe(true);
	await page.getByRole('button', { name: 'Switch to side-by-side layout', exact: true }).click();
	await separator.press('End'); // Tiny settings pane, longest suffix remains in order.
	await expect.poll(async () => (await geometry(page)).clipped).toBe(true);
	await expect.poll(async () => (await geometry(page)).tailVisible).toBe(true);
	await expect.poll(async () => (await geometry(page)).identity).toBe(true);
});

test('native link supports focus, context menu, new tab and keyboard navigation', async ({
	page,
	context
}) => {
	await open(page);
	await page.keyboard.press('Tab');
	await share(page).focus();
	await expect(share(page)).toBeFocused();
	expect(await share(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
	await share(page).click({ button: 'right' });
	await expect(page).toHaveURL(new RegExp(`^${browserOrigin}/\\?v=`));
	await page.keyboard.press('Escape');
	const opened = context.waitForEvent('page');
	await share(page).click({ modifiers: ['ControlOrMeta'] });
	const tab = await opened;
	await expect(tab).toHaveURL(destination);
	await tab.close();
	await share(page).press('Enter');
	await expect(page).toHaveURL(destination);
	await expect(page.locator('.settings-footer')).toHaveCount(0);
});

test('loading, invalid bounds and player errors use a non-clickable fallback', async ({ page }) => {
	await page.route(/youtube(?:-nocookie)?\.com/, (route) => route.abort());
	await page.goto(`/?v=${id}&t=5~50&mute`);
	await expect(page.locator('.settings-footer')).toContainText('Unavailable');
	await expect(share(page)).toHaveCount(0);
	await page.unroute(/youtube(?:-nocookie)?\.com/);
	await open(page);
	await page.getByRole('slider', { name: 'Repeat end', exact: true }).fill('5');
	await expect(share(page)).toHaveCount(0);
	await expect(page.locator('.settings-footer')).toContainText('Unavailable');
	await expect(page.getByRole('alert')).toContainText('Invalid clip');
	await page.getByRole('slider', { name: 'Repeat end', exact: true }).fill('60');
	await expect(share(page)).toHaveAttribute('href', /^http/);
	await page.locator('youtube-video').evaluate((media) => {
		Object.defineProperty(media, 'error', {
			configurable: true,
			value: { message: 'Test player failure' }
		});
		media.dispatchEvent(new Event('error'));
	});
	await expect(page.getByRole('alert')).toContainText('Test player failure');
	await expect(share(page)).toHaveCount(0);
	await expect(page.locator('.settings-footer')).toContainText('Unavailable');
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test.describe(`mobile footer ${viewport.width}x${viewport.height}`, () => {
		test.use({ viewport, screen: viewport, hasTouch: true, isMobile: true });
		test('native picture scroll keeps footer and controls independent', async ({ page }) => {
			await open(page);
			await expect(page.locator('.editor-workspace')).toHaveClass(/video-scroll/);
			await page.evaluate(() => window.scrollTo(0, 200));
			await expect.poll(async () => (await geometry(page)).fits).toBe(true);
			const before = await geometry(page);
			await page.locator('.settings-scroll').evaluate((el) => {
				el.scrollTop = el.scrollHeight;
			});
			await expect.poll(async () => (await geometry(page)).top).toBe(before.top);
			await expect(share(page)).toHaveAttribute('href', destination);
			expect((await geometry(page)).identity).toBe(true);
		});
	});
}

for (const height of [568, 844]) {
	test.describe(`toolbar reserve at 390x${height}`, () => {
		test.use({ viewport: { width: 390, height }, hasTouch: true, isMobile: true });
		test('footer follows simulated toolbar collapse without moving the preview or scroll', async ({
			page
		}) => {
			await open(page);
			// Headless browsers have no Safari toolbar: substitute viewport measurements
			// in the actual reserve expression, keeping lvh and svh fixed as dvh changes.
			await page.locator('.settings-pane').evaluate((el) => {
				const pane = el as HTMLElement;
				const reserve = getComputedStyle(pane).getPropertyValue('--browser-chrome-reserve');
				pane.style.setProperty(
					'--browser-chrome-reserve',
					reserve
						.replace(/100lvh/g, `${innerHeight}px`)
						.replace(/100svh/g, `${innerHeight - 120}px`)
						.replace(/100dvh/g, 'var(--test-visible-height)')
				);
				pane.style.setProperty('--test-visible-height', `${innerHeight - 120}px`);
				const scroll = pane.querySelector('.settings-scroll')!;
				const spacer = document.createElement('div');
				spacer.style.height = '1400px';
				scroll.prepend(spacer);
				scroll.scrollTop = 100;
			});
			const measure = () =>
				page.evaluate(() => {
					const rect = (selector: string) => {
						const { top, bottom, height } = document
							.querySelector(selector)!
							.getBoundingClientRect();
						return { top, bottom, height };
					};
					return {
						footer: rect('.settings-footer'),
						preview: rect('#editor-preview'),
						grid: rect('.workspace-grid'),
						edge: rect('.settings-edge'),
						scroll: document.querySelector('.settings-scroll')!.scrollTop,
						documentScroll: scrollY
					};
				});
			const before = await measure();
			for (const reserve of [120, 90, 60, 30, 0, 30, 60, 90, 120]) {
				await page.locator('.settings-pane').evaluate((el, gap) => {
					(el as HTMLElement).style.setProperty('--test-visible-height', `${innerHeight - gap}px`);
				}, reserve);
				const state = await measure();
				expect(state.footer.bottom).toBeCloseTo(height - reserve, 0);
				expect(state.footer.height).toBe(before.footer.height);
				expect(state.preview).toEqual(before.preview);
				expect(state.grid).toEqual(before.grid);
				expect(state.edge.bottom).toBe(height);
				expect(state.scroll).toBe(before.scroll);
				expect(state.documentScroll).toBe(before.documentScroll);
				expect((await geometry(page)).identity).toBe(true);
			}
			await page.locator('.settings-scroll').evaluate((el) => {
				el.scrollTop = el.scrollHeight;
			});
			expect(
				await page.locator('.settings-content').evaluate((el) => el.getBoundingClientRect().bottom)
			).toBeLessThanOrEqual((await measure()).footer.top + 1);
			await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
		});
	});
}
