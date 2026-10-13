import { test, expect } from '@playwright/test';
import { videoExamples } from '../../src/lib/player/video-examples';
import { parseEditorSource } from '../../src/lib/player/editor-source';
import { serializeEditorUrl } from '../../src/lib/share-url';

for (const width of [1280, 390]) {
	test(`empty root and first-open picker at ${width}px`, async ({ page }) => {
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
		await dialog.getByRole('button', { name: 'Load from clipboard' }).click();
		await expect(dialog.getByRole('status')).toContainText('Paste your link');
		await expect(input).toHaveValue('manual draft');
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: { readText: async () => 'invalid' }
			})
		);
		await dialog.getByRole('button', { name: 'Load from clipboard' }).click();
		await expect(dialog.getByRole('status')).toContainText('valid YouTube');
		await expect(input).toHaveValue('manual draft');
		await input.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(choose).toBeFocused();
		await choose.click();
		await expect(input).toHaveValue('manual draft');
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
	test(`preset ${example.label} commits canonical state and reloads`, async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Choose video', exact: true }).click();
		const source = parseEditorSource(example.href)!;
		await page.getByRole('dialog').getByRole('link', { name: example.label, exact: true }).click();
		await expect(page).toHaveURL('http://localhost:5173' + serializeEditorUrl(source.clip!));
		await page.waitForFunction(
			() => (document.querySelector('youtube-video') as HTMLMediaElement)?.duration > 10,
			undefined,
			{ timeout: 30_000 }
		);
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.locator('youtube-video')).toHaveCount(1);
		await expect(
			page.getByRole('link', { name: `youtu.be/${source.videoId}`, exact: true })
		).toBeVisible();
		await page.reload();
		await expect(page.locator('youtube-video')).toHaveCount(1);
		await expect(
			page.getByRole('link', { name: `youtu.be/${source.videoId}`, exact: true })
		).toBeVisible();
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
	await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
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
	await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveValue('31');
	await expect(page.getByRole('slider', { name: 'Repeat end', exact: true })).toHaveValue('38');
	expect(
		await page.locator('youtube-video').evaluate((media) => (media as HTMLMediaElement).paused)
	).toBe(true);
	await expect(page.getByRole('button', { name: 'Change video' })).toBeFocused();
});

test('short preview keeps all examples reachable and dialog contains scroll through rotation', async ({
	page
}) => {
	await page.setViewportSize({ width: 844, height: 390 });
	await page.goto('/');
	const last = page.getByRole('link', { name: 'Advanced timing', exact: true });
	await last.scrollIntoViewIfNeeded();
	const boxes = await page.evaluate(() => {
		const area = document.querySelector('.empty-preview')!.getBoundingClientRect();
		const link = document.querySelector('.empty-preview nav a:last-child')!.getBoundingClientRect();
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
	await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect
		.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflow))
		.not.toBe('hidden');
});
