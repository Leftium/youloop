import { test, expect, type Page } from '@playwright/test';

const id = 'dt-SqNL4z3w';
const orientation = (page: Page) => page.getByRole('group', { name: 'Media orientation' });
const crop = (page: Page) => page.getByRole('group', { name: 'Crop', exact: true });
const choice = (page: Page, group: 'orientation' | 'crop', label: string) =>
	(group === 'orientation' ? orientation(page) : crop(page)).getByRole('button', {
		name: label,
		exact: true
	});
const query = (page: Page) => new URL(page.url()).searchParams;

async function settled(page: Page) {
	await page.waitForFunction(() => {
		const media = document.querySelector('youtube-video') as HTMLMediaElement;
		return (
			media?.duration > 0 &&
			media.paused &&
			!media.seeking &&
			!!media.shadowRoot?.querySelector('iframe')
		);
	});
}
async function saveIdentity(page: Page) {
	await page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		Object.assign(window, {
			savedMedia: media,
			savedFrame: media.shadowRoot?.querySelector('iframe'),
			savedEngine: media.engine
		});
	});
}
async function identity(page: Page) {
	expect(
		await page.evaluate(() => {
			const saved = window as unknown as {
				savedMedia: Element;
				savedFrame: Element;
				savedEngine: unknown;
			};
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			return (
				media === saved.savedMedia &&
				media.shadowRoot?.querySelector('iframe') === saved.savedFrame &&
				media.engine === saved.savedEngine
			);
		})
	).toBe(true);
}

for (const width of [1280, 390, 320]) {
	test(`three-state overrides, Auto and independent crop at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await page.goto(`/?v=IF_7SLHdreQ&mute`);
		await settled(page);
		await expect
			.poll(() =>
				page
					.locator('.player')
					.evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--video-source-ratio')))
			)
			.toBeLessThan(1);
		await saveIdentity(page);
		for (const group of ['orientation', 'crop'] as const) {
			await expect(choice(page, group, 'Auto')).toHaveAttribute('aria-pressed', 'true');
		}
		for (const label of ['Landscape', 'Portrait']) {
			await choice(page, 'orientation', label).click();
			await expect.poll(() => query(page).get('vertical')).toBe(label === 'Landscape' ? '0' : '');
			await choice(page, 'orientation', 'Auto').click();
			await expect.poll(() => query(page).has('vertical')).toBe(false);
			await expect(choice(page, 'orientation', 'Auto')).toHaveAttribute('aria-pressed', 'true');
			await expect
				.poll(() =>
					page
						.locator('.player')
						.evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--media-ratio')))
				)
				.toBe(9 / 16);
		}
		for (const label of ['Fit', 'Fill']) {
			await choice(page, 'crop', label).click();
			for (const frame of ['Landscape', 'Portrait', 'Auto']) {
				await choice(page, 'orientation', frame).click();
				await expect(choice(page, 'crop', label)).toHaveAttribute('aria-pressed', 'true');
				await expect.poll(() => query(page).get('fill')).toBe(label === 'Fit' ? '0' : '');
			}
			await choice(page, 'crop', 'Auto').click();
			await expect.poll(() => query(page).has('fill')).toBe(false);
		}
		await choice(page, 'orientation', 'Landscape').click();
		await expect(choice(page, 'crop', 'Auto')).toHaveAttribute('aria-pressed', 'true');
		await expect
			.poll(async () =>
				page.locator('.media-canvas').evaluate((el) => {
					const box = el.getBoundingClientRect();
					const ratio = Number(getComputedStyle(el).getPropertyValue('--video-source-ratio'));
					const videoWidth = el
						.querySelector('youtube-video')!
						.shadowRoot!.querySelector('iframe')!
						.getBoundingClientRect().width;
					return Math.abs(videoWidth - Math.max(box.width, box.height * ratio));
				})
			)
			.toBeLessThan(1);
		await identity(page);
		for (const group of [orientation(page), crop(page)]) {
			for (const button of await group.getByRole('button').all())
				await expect(button).toBeVisible();
		}
		expect(
			await page.locator('#editor-settings').evaluate((el) => el.scrollWidth <= el.clientWidth)
		).toBe(true);
	});
}

test('mirror preserves playing, paused and seeking media with unreflected controls', async ({
	page
}) => {
	await page.goto(`/?v=${id}&t=31~38&once&mute&speed=0.5&vertical&fill=0`);
	await settled(page);
	await saveIdentity(page);
	const toggle = page.getByRole('switch', { name: 'Mirror video', exact: true });
	const state = () =>
		page.locator('youtube-video').evaluate((el) => {
			const media = el as HTMLMediaElement;
			const box = media.shadowRoot!.querySelector('iframe')!.getBoundingClientRect();
			return {
				time: media.currentTime,
				paused: media.paused,
				muted: media.muted,
				speed: media.playbackRate,
				width: box.width,
				height: box.height
			};
		});
	const paused = await state();
	await toggle.check();
	await expect.poll(() => query(page).has('mirror')).toBe(true);
	const flipped = await state();
	expect(flipped.paused).toBe(true);
	expect(flipped.time).toBeCloseTo(paused.time, 1);
	expect(flipped.width).toBeCloseTo(paused.width, 1);
	expect(flipped.height).toBe(16000);
	await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
		'href',
		new URL(`/${id}/31~38?once&mute&speed=0.5&vertical&fill=0&mirror`, 'http://localhost:5173').href
	);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await state()).paused).toBe(false);
	const playing = await state();
	await toggle.uncheck();
	await toggle.check();
	const after = await state();
	expect(after.paused).toBe(false);
	expect(after.time).toBeGreaterThanOrEqual(playing.time - 0.1);
	expect(after.muted).toBe(true);
	expect(after.speed).toBe(0.5);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('slider', { name: 'Current time', exact: true }).fill('34');
	await toggle.uncheck();
	await expect.poll(async () => (await state()).time).toBeCloseTo(34, 0);
	await toggle.check();
	await identity(page);
	expect(
		await page.evaluate(() => {
			const video = document.querySelector('youtube-video')!;
			const ui = document.querySelectorAll(
				'.video-toggle,.preview-brand,.preview-playback,.controls,.media-canvas'
			);
			return {
				video: getComputedStyle(video).transform,
				ui: [...ui].map((el) => {
					const matrix = new DOMMatrix(getComputedStyle(el).transform);
					return { x: matrix.a, y: matrix.d };
				})
			};
		})
	).toEqual({
		video: 'matrix(-1, 0, 0, 1, 0, 0)',
		ui: Array.from({ length: 5 }, () => ({ x: 1, y: 1 }))
	});
	for (const key of ['once', 'mute', 'vertical', 'fill', 'speed'])
		expect(query(page).get(key)).toBe(key === 'speed' ? '0.5' : key === 'fill' ? '0' : '');
});

test('mirror watch/editor reload, history, false flags and source imports', async ({ page }) => {
	await page.goto(`/?v=${id}&mute=0&mirror=0&vertical=0&fill=0`);
	await settled(page);
	await expect(page).toHaveURL(`http://localhost:5173/?v=${id}&vertical=0&fill=0`);
	await page.getByRole('switch', { name: 'Mirror video' }).check();
	await page.reload();
	await settled(page);
	await expect(page.getByRole('switch', { name: 'Mirror video' })).toBeChecked();
	await page.getByRole('link', { name: 'Share URL', exact: true }).click();
	await expect(page).toHaveURL(`http://localhost:5173/${id}?vertical=0&fill=0&mirror`);
	await expect(page.locator('youtube-video')).toHaveClass(/mirrored/);
	await expect(
		page.getByRole('link', { name: 'Switch to edit-first mode', exact: true })
	).toHaveAttribute('href', `/?v=${id}&vertical=0&fill=0&mirror`);
	await settled(page);
	await page.reload();
	await settled(page);
	await page.goBack();
	await expect(page.getByRole('switch', { name: 'Mirror video' })).toBeChecked();
	await page.goForward();
	await expect(page.locator('youtube-video')).toHaveClass(/mirrored/);
	await page.getByRole('link', { name: 'Switch to edit-first mode', exact: true }).click();
	for (const [input, mirror] of [
		[`/${id}?mirror&vertical&fill`, true],
		[`/${id}?vertical=0&fill=0`, false],
		[id, false],
		['/IF_7SLHdreQ?mirror', true],
		['jNQXAC9IVRw', false]
	] as const) {
		await page.getByRole('button', { name: 'Change video' }).click();
		const dialog = page.getByRole('dialog');
		await dialog.getByRole('textbox').fill(input);
		await dialog.getByRole('button', { name: 'Load', exact: true }).click();
		await expect.poll(() => query(page).has('mirror')).toBe(mirror);
		await expect(page.getByRole('switch', { name: 'Mirror video' })).toBeChecked({
			checked: mirror
		});
	}
});

for (const videoId of ['NSGIZbUbIWw', 'b90IRPG5UZs']) {
	test(`mirror preserves crop fixture ${videoId}`, async ({ page }) => {
		const originalAspect = page.waitForResponse(`https://i.ytimg.com/vi/${videoId}/oar2.jpg`);
		await page.goto(
			`/?v=${videoId}&t=${videoId === 'NSGIZbUbIWw' ? 9 : 6}~&mute&fill&${videoId === 'NSGIZbUbIWw' ? 'vertical=0' : 'vertical'}`
		);
		await (await originalAspect).finished();
		await page.waitForFunction(() => {
			const media = document.querySelector('youtube-video') as HTMLMediaElement & {
				engine?: { getDuration(): number };
			};
			return (
				media?.duration > 0 &&
				(media.engine?.getDuration() ?? 0) > 0 &&
				!!media.shadowRoot?.querySelector('iframe')
			);
		});
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
				)
		);
		await expect
			.poll(() =>
				page
					.locator('.player')
					.evaluate(
						(el) => Number(getComputedStyle(el).getPropertyValue('--video-source-ratio')) < 1
					)
			)
			.toBe(videoId === 'NSGIZbUbIWw');
		await saveIdentity(page);
		const size = () =>
			page.locator('youtube-video').evaluate((el) => {
				const box = el.shadowRoot!.querySelector('iframe')!.getBoundingClientRect();
				return { width: box.width, height: box.height, x: box.x, y: box.y };
			});
		for (const width of [1280, 390, 844]) {
			await page.setViewportSize({ width, height: 844 });
			await page.getByRole('switch', { name: 'Mirror video' }).uncheck();
			await expect
				.poll(async () =>
					page.locator('.media-canvas').evaluate((el) => {
						const box = el.getBoundingClientRect();
						const ratio = Number(getComputedStyle(el).getPropertyValue('--video-source-ratio'));
						const frame = el
							.querySelector('youtube-video')!
							.shadowRoot!.querySelector('iframe')!
							.getBoundingClientRect();
						return Math.max(
							Math.abs(frame.width - Math.max(box.width, box.height * ratio)),
							Math.abs(frame.height - 16000),
							Math.abs(frame.x + frame.width / 2 - box.x - box.width / 2),
							Math.abs(frame.y + frame.height / 2 - box.y - box.height / 2)
						);
					})
				)
				.toBeLessThan(1);
			const before = await size();
			await page.getByRole('switch', { name: 'Mirror video' }).check();
			const after = await size();
			for (const key of ['width', 'height', 'x', 'y'] as const)
				expect(Math.abs(after[key] - before[key])).toBeLessThan(1);
		}
		await identity(page);
	});
}

test('pending detection survives Orientation Auto without duplicate requests', async ({ page }) => {
	let requests = 0;
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.route('https://i.ytimg.com/vi/IF_7SLHdreQ/oar2.jpg', async (route) => {
		requests++;
		await gate;
		await route.continue();
	});
	await page.route('https://www.youtube.com/oembed?*', (route) =>
		route.fulfill({ json: { width: 200, height: 113 } })
	);
	await page.goto('/?v=IF_7SLHdreQ&mute');
	await choice(page, 'orientation', 'Landscape').click();
	await choice(page, 'orientation', 'Auto').click();
	release();
	await expect
		.poll(() =>
			page
				.locator('.player')
				.evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--video-source-ratio')))
		)
		.toBeLessThan(1);
	await expect(choice(page, 'orientation', 'Auto')).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => query(page).has('vertical')).toBe(false);
	expect(requests).toBe(1);
});

test('mirrored watch media survives resize, Theater and available fullscreen', async ({ page }) => {
	await page.goto(`/${id}/31~38?mute&vertical&fill=0&mirror`);
	await settled(page);
	await saveIdentity(page);
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 },
		{ width: 1280, height: 800 }
	]) {
		await page.setViewportSize(viewport);
		await expect(page.locator('youtube-video')).toHaveClass(/mirrored/);
		await identity(page);
		expect(
			await page.locator('youtube-video').evaluate((el) => getComputedStyle(el).transform)
		).toBe('matrix(-1, 0, 0, 1, 0, 0)');
		await expect(page.getByRole('button', { name: 'Theater mode', exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Theater mode', exact: true }).click();
		await expect(page.locator('.share-prototype')).toHaveAttribute('data-mode', 'theater');
		await page.waitForFunction(() => window.scrollY >= 80);
		await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
		await expect(page.locator('.share-prototype')).toHaveAttribute('data-mode', 'default');
	}
	if (await page.evaluate(() => document.fullscreenEnabled)) {
		await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click();
		await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
		await identity(page);
		await expect(page.locator('youtube-video')).toHaveClass(/mirrored/);
		await page.getByRole('button', { name: 'Exit fullscreen', exact: true }).click();
		await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
	}
	await identity(page);
	for (const selector of ['.watch-title', '.watch-overlay', '.video-toggle']) {
		for (const el of await page.locator(selector).all()) {
			expect(await el.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)).toBe(1);
		}
	}
});
