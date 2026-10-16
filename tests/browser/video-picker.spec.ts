import { expect } from '@playwright/test';
import { test, browserOrigin } from './youtube-api.fixture';
import { videoExamples } from '../../src/lib/player/video-examples';
import { parseEditorSource } from '../../src/lib/player/editor-source';
import { serializeEditorUrl } from '../../src/lib/share-url';

for (const width of [1280, 390]) {
	test(`empty root and first-open picker at ${width}px @routine @webkit-smoke`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await expect(page.locator('youtube-video')).toHaveCount(0);
		const choose = page.getByRole('button', { name: 'Choose video', exact: true });
		await choose.click();
		const dialog = page.getByRole('dialog', { name: 'Choose video' });
		const input = dialog.getByRole('textbox');
		await expect(dialog).toBeVisible();
		if (width < 661) await expect(input).not.toBeFocused();
		else await expect(input).toBeFocused();
		await input.fill('manual draft');
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					readText: async () => {
						throw Error('Denied');
					}
				}
			})
		);
		await dialog.getByRole('button', { name: 'Paste from clipboard' }).click();
		await expect(dialog.getByRole('status')).toContainText('Paste your link');
		await expect(input).toHaveValue('manual draft');
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { readText: async () => 'invalid' }
			})
		);
		await dialog.getByRole('button', { name: 'Paste from clipboard' }).click();
		await expect(dialog.getByRole('status')).toContainText('valid YouTube');
		await expect(input).toHaveValue('invalid');
		await input.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(choose).toBeFocused();
		await choose.click();
		await expect(input).toHaveValue('');
		await input.fill('dt-SqNL4z3w');
		await input.press('Enter');
		await expect(page).toHaveURL(/\?v=dt-SqNL4z3w$/);
		await expect(page.locator('youtube-video')).toHaveCount(1);
		await page.goBack();
		await expect(choose).toBeVisible();
		await expect(page.locator('youtube-video')).toHaveCount(0);
		await page.goForward();
		await expect(page.locator('youtube-video')).toHaveCount(1);
	});
}

for (const example of videoExamples) {
	const reload = example.label === 'Basic A:B loop';
	test(`preset ${example.label} commits canonical state${reload ? ' and reloads' : ''} @routine`, async ({
		page
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Choose video', exact: true }).click();
		const source = parseEditorSource(example.href)!;
		await page.getByRole('dialog').getByRole('link', { name: example.label, exact: true }).click();
		await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue(example.href);
		await expect(page).toHaveURL(`${browserOrigin}/`);
		await expect(page.locator('youtube-video')).toHaveCount(0);
		await page.getByRole('dialog').getByRole('button', { name: 'Load', exact: true }).click();
		await expect(page).toHaveURL(browserOrigin + serializeEditorUrl(source.clip!));
		// Picker commits do not depend on live provider duration.
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.locator('youtube-video')).toHaveCount(1);
		const originalLink = page.locator('.source-link a');
		await expect(originalLink).toBeVisible();
		await expect(originalLink).toContainText(`youtu.be/${source.videoId}`);
		// Reload the common picker commit path once; signed/crop reloads have dedicated coverage.
		if (reload) {
			await page.reload();
			await expect(page.locator('youtube-video')).toHaveCount(1);
			await expect(originalLink).toBeVisible();
			await expect(originalLink).toContainText(`youtu.be/${source.videoId}`);
		}
	});
}

test('dialog cancel preserves live media, bounds, title and splitter', async ({ page }) => {
	await page.goto('/?v=dt-SqNL4z3w&t=31~38&mute');
	await expect(page.locator('youtube-video')).toHaveCount(1);
	await expect(page.getByLabel('YouTube video title', { exact: true })).toContainText('BFX 2011');
	await page.waitForFunction(() => {
		const media = document.querySelector('youtube-video') as HTMLMediaElement;
		return media?.duration > 0 && media.paused && !media.seeking;
	});
	const before = await page.evaluate(() => {
		Object.assign(window, { savedMedia: document.querySelector('youtube-video') });
		return {
			url: location.href,
			layout: sessionStorage.getItem('youloop.editor-workspace'),
			title: document.querySelector('.source-title')?.textContent
		};
	});
	await page.getByRole('button', { name: 'Change video' }).click();
	await page.getByRole('dialog').getByRole('textbox').fill('jNQXAC9IVRw');
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Close video picker', exact: true })
		.click();
	expect(
		await page.evaluate(
			() =>
				document.querySelector('youtube-video') ===
				(window as unknown as { savedMedia: Element }).savedMedia
		)
	).toBe(true);
	expect(page.url()).toBe(before.url);
	expect(await page.evaluate(() => sessionStorage.getItem('youloop.editor-workspace'))).toBe(
		before.layout
	);
	await expect(page.getByLabel('YouTube video title', { exact: true })).toHaveText(before.title!);
	await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveAttribute(
		'aria-valuenow',
		'31'
	);
	await expect(page.getByRole('slider', { name: 'Repeat end', exact: true })).toHaveAttribute(
		'aria-valuenow',
		'38'
	);
	expect(
		await page.locator('youtube-video').evaluate((media) => (media as HTMLMediaElement).paused)
	).toBe(true);
	await expect(page.getByRole('button', { name: 'Change video' })).toBeFocused();
});

test(
	'short preview keeps all examples reachable and dialog contains scroll through rotation @routine @webkit-smoke',
	{ tag: '@provider-free' },
	async ({ page }) => {
		await page.setViewportSize({ width: 844, height: 390 });
		await page.goto('/');
		const last = page.locator('.welcome .cards a:last-child');
		await last.scrollIntoViewIfNeeded();
		const boxes = await page.evaluate(() => {
			const area = document.querySelector('.welcome')!.getBoundingClientRect();
			const link = document.querySelector('.welcome .cards a:last-child')!.getBoundingClientRect();
			return { areaBottom: area.bottom, linkBottom: link.bottom };
		});
		expect(boxes.linkBottom).toBeLessThanOrEqual(boxes.areaBottom + 1);
		await page.getByRole('button', { name: 'Choose video', exact: true }).click();
		const dialog = page.getByRole('dialog');
		await expect
			.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow))
			.toBe('hidden');
		await page.setViewportSize({ width: 390, height: 844 });
		await dialog.getByRole('textbox').focus();
		await page.setViewportSize({ width: 390, height: 360 });
		await dialog.getByRole('button', { name: 'Load', exact: true }).scrollIntoViewIfNeeded();
		const bounds = await dialog.getByRole('button', { name: 'Load', exact: true }).boundingBox();
		expect(bounds!.y).toBeGreaterThanOrEqual(0);
		expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(360);
		await dialog.getByRole('button', { name: 'Close video picker', exact: true }).click();
		await expect
			.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow))
			.not.toBe('hidden');
	}
);

test(
	'one Escape wins over input blur handlers and respects composition @routine @webkit-smoke',
	{ tag: '@provider-free' },
	async ({ page }) => {
		await page.goto('/');
		const choose = page.getByRole('button', { name: 'Choose video', exact: true });
		await choose.click();
		const dialog = page.getByRole('dialog');
		const input = dialog.getByRole('textbox');
		await input.fill('draft to retain');
		await input.evaluate((element) =>
			element.addEventListener('keydown', (event) => {
				if ((event as KeyboardEvent).key === 'Escape') {
					event.preventDefault();
					event.stopPropagation();
					(element as HTMLElement).blur();
				}
			})
		);
		await input.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(choose).toBeFocused();
		await choose.click();
		await expect(input).toHaveValue('');
		await input.focus();
		await input.dispatchEvent('compositionstart');
		await input.press('Escape');
		await expect(dialog).toBeVisible();
		await input.dispatchEvent('compositionend');
		await input.focus();
		await input.press('Escape');
		await expect(dialog).not.toBeVisible();
	}
);

test(
	'dialog whitespace is inert, actual backdrop dismisses, and links fit their visible text',
	{ tag: '@provider-free' },
	async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto('/');
		await page.getByRole('button', { name: 'Choose video', exact: true }).click();
		const dialog = page.getByRole('dialog');
		const input = dialog.getByRole('textbox');
		await input.fill('retained');
		const link = dialog.getByRole('link', { name: 'Basic A:B loop', exact: true });
		const linkBox = (await link.boundingBox())!;
		const box = (await dialog.boundingBox())!;
		expect(linkBox.width).toBeLessThan(box.width / 2);
		await page.mouse.click(box.x + box.width - 28, linkBox.y + linkBox.height / 2);
		await expect(dialog).toBeVisible();
		await expect(page).toHaveURL(`${browserOrigin}/`);
		await page.mouse.click(4, 4);
		await expect(dialog).not.toBeVisible();
		await page.getByRole('button', { name: 'Choose video', exact: true }).click();
		await expect(input).toHaveValue('');
		await dialog.getByRole('button', { name: 'Close video picker' }).click();
		await expect(dialog).not.toBeVisible();
	}
);

test('candidate metadata is debounced, stale-safe, optional, and never commits playback', async ({
	page
}) => {
	const requests: string[] = [];
	await page.route('**/api/video-metadata?*', async (route) => {
		const id = new URL(route.request().url()).searchParams.get('v')!;
		requests.push(id);
		if (id === 'dt-SqNL4z3w') await new Promise((resolve) => setTimeout(resolve, 1000));
		await route
			.fulfill({
				json:
					id === 'NSGIZbUbIWw'
						? { title: null, image: null }
						: {
								title: id === 'dt-SqNL4z3w' ? 'Old candidate' : 'New candidate',
								image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
							}
			})
			.catch(() => {});
	});
	await page.goto('/');
	await page.getByRole('button', { name: 'Choose video', exact: true }).click();
	const dialog = page.getByRole('dialog');
	const input = dialog.getByRole('textbox', {
		name: 'YouTube URL, ID, or YouLoop link',
		exact: true
	});
	await input.fill('bad');
	await page.waitForTimeout(350);
	expect(requests).toEqual([]);
	await input.fill('dt-SqNL4z3w');
	await expect.poll(() => requests.length).toBe(1);
	await input.fill('/jNQXAC9IVRw/2~5?mute');
	await expect(dialog.locator('.candidate-preview')).toContainText('New candidate');
	await expect(dialog.getByRole('img', { name: 'Candidate video thumbnail' })).toHaveAttribute(
		'src',
		/jNQXAC9IVRw/
	);
	await page.waitForTimeout(1100);
	await expect(dialog.locator('.candidate-preview')).not.toContainText('Old candidate');
	await expect(page.locator('youtube-video')).toHaveCount(0);
	await expect(page).toHaveURL(`${browserOrigin}/`);
	await input.fill('NSGIZbUbIWw');
	await expect(dialog.locator('.candidate-preview')).toContainText('You can still load');
	await input.press('Enter');
	await expect(page).toHaveURL(/v=NSGIZbUbIWw/);
	await expect(page.locator('youtube-video')).toHaveCount(1);
});

test('clipboard preview does not commit until Load @routine', async ({ page }) => {
	await page.route('**/api/video-metadata?*', (route) =>
		route.fulfill({
			json: {
				title: 'Selected candidate',
				image: `${browserOrigin}/logo.svg`
			}
		})
	);
	await page.goto('/');
	await page.getByRole('button', { name: 'Choose video', exact: true }).click();
	const dialog = page.getByRole('dialog');
	const input = dialog.getByRole('textbox');
	await expect(input).toHaveValue('');
	await page.evaluate(() =>
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { readText: async () => 'https://youtu.be/dt-SqNL4z3w?t=31s' }
		})
	);
	await dialog.getByRole('button', { name: 'Paste from clipboard' }).click();
	await expect(input).toHaveValue('https://youtu.be/dt-SqNL4z3w?t=31s');
	await expect(dialog.locator('.candidate-preview')).toContainText('Selected candidate');
	await expect(page).toHaveURL(`${browserOrigin}/`);
	await expect(page.locator('youtube-video')).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Load', exact: true }).click();
	await expect(page).toHaveURL(/v=dt-SqNL4z3w&t=31~/);
});

test.describe('invisible touch targets', () => {
	test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
	test(
		'X closes when tapped outside its visible icon @routine @webkit-smoke',
		{ tag: '@provider-free' },
		async ({ page }) => {
			await page.goto('/');
			await page.getByRole('button', { name: 'Choose video', exact: true }).click();
			const dialog = page.getByRole('dialog');
			const close = dialog.getByRole('button', { name: 'Close video picker' });
			const box = (await close.boundingBox())!;
			expect(box.height).toBeLessThan(44);
			const target = await close.evaluate((el) => ({
				height: getComputedStyle(el, '::after').height,
				background: getComputedStyle(el).backgroundColor
			}));
			expect(parseFloat(target.height)).toBeGreaterThanOrEqual(44);
			expect(target.background).toBe('rgba(0, 0, 0, 0)');
			await page.touchscreen.tap(box.x + box.width / 2, box.y - 3);
			await expect(dialog).not.toBeVisible();
		}
	);
});

test('landing cards expose every preset and directly open a canonical editor clip @routine', async ({
	page
}) => {
	await page.goto('/');
	for (const [index, example] of videoExamples.entries()) {
		await expect(page.locator('.cards a').nth(index)).toHaveAttribute('href', example.href);
	}
	// Every preset still loads through the picker; exercise the shared direct-card navigation once.
	// The picker button enables after mount; an early native navigation can interrupt hydration.
	await expect(page.getByRole('button', { name: 'Choose video', exact: true })).toBeEnabled();
	const example = videoExamples[0];
	await page.locator('.cards a').first().click();
	await expect(page).toHaveURL(
		browserOrigin + serializeEditorUrl(parseEditorSource(example.href)!.clip!)
	);
	await expect(page.locator('youtube-video')).toHaveCount(1);
	await expect(page.getByRole('dialog')).not.toBeVisible();
});
