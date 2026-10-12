import { test, expect, type Page } from '@playwright/test';

const id = 'dt-SqNL4z3w';
const mediaState = (page: Page) =>
	page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & {
			currentTime: number;
			duration: number;
			muted: boolean;
			playbackRate: number;
			paused: boolean;
			engine?: { getPlayerState(): number };
		};
		return {
			time: media?.currentTime,
			duration: media?.duration,
			muted: media?.muted,
			speed: media?.playbackRate,
			paused: media?.paused,
			state: media?.engine?.getPlayerState()
		};
	});

async function settled(page: Page) {
	await page.waitForFunction(
		() => {
			const media = document.querySelector('youtube-video') as HTMLElement & {
				duration: number;
				paused: boolean;
			};
			return (
				media?.duration > 0 &&
				media.paused &&
				!document.querySelector('.controls[inert]') &&
				!!media.shadowRoot?.querySelector('iframe')
			);
		},
		{ timeout: 30_000 }
	);
	await expect.poll(async () => page.locator('body').innerText()).not.toContain('?:??');
}

async function runModule(page: Page, file: string, method = 'run', options: object = {}) {
	return page.evaluate(
		async ({ file, method, options }) => {
			const module = await import(`/src/lib/player/${file}.browser-test.ts`);
			return module[method](options);
		},
		{ file, method, options }
	);
}

test('bare root stays generic; malformed and reserved routes are safe', async ({ page }) => {
	await page.goto('/');
	await settled(page);
	await expect(page).toHaveURL('http://localhost:5173/');
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		`/${id}?t=31-38`
	);
	for (const path of [`/?v=${id}&t=bad`, `/${id}?mute=0&mute`, `/?v=bad`]) {
		await page.goto(path);
		await expect(page.getByRole('alert')).toContainText('Invalid link');
		await expect(page.locator('youtube-video')).toHaveCount(0);
	}
	for (const path of ['/about', '/v1', '/bad-video', '/__hosting_missing_route__']) {
		expect((await page.goto(path))?.status()).toBe(404);
	}
});

test('editor aliases, live state, canonical sharing, reload and Back/Forward', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(
		`/?v=${id}&a=24.5&b=32.75&orientation=portrait&fit=contain&mute=0&speed=1.5&once`
	);
	await settled(page);
	await expect(page.getByRole('button', { name: 'Portrait', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Crop to fill' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(page.getByRole('button', { name: 'Loop', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect.poll(async () => (await mediaState(page)).speed).toBe(1.5);
	await expect.poll(async () => (await mediaState(page)).muted).toBe(false);
	await page.evaluate(() => {
		(window as unknown as { savedMedia: Element | null }).savedMedia =
			document.querySelector('youtube-video');
	});
	await page.getByRole('slider', { name: 'Repeat start', exact: true }).fill('25.5');
	await page.getByRole('slider', { name: 'Repeat end', exact: true }).fill('33.2');
	await page.getByRole('button', { name: 'Crop to fill' }).click();
	await page.getByRole('button', { name: 'Mute', exact: true }).click();
	const expected = `/${id}?t=25.5-33.2&once&mute&speed=1.5&vertical&fill`;
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		expected
	);
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { savedMedia: Element }).savedMedia ===
				document.querySelector('youtube-video')
		)
	).toBe(true);
	await page.getByRole('button', { name: 'Copy Link', exact: true }).click();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		`http://localhost:5173${expected}`
	);
	await page.reload();
	await settled(page);
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		expected
	);
	await page.getByRole('link', { name: 'Open video', exact: true }).click();
	await settled(page);
	await expect(page.locator('.share-prototype')).toHaveCount(1);
	await expect(page.locator('.brand')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute(
		'href',
		`/?v=${id}&t=25.5-33.2&once&mute&speed=1.5&vertical&fill`
	);
	await page.goBack();
	await settled(page);
	await expect(page.getByRole('button', { name: 'Next frame' })).toBeVisible();
	await page.goForward();
	await settled(page);
	await page.getByRole('link', { name: 'Edit', exact: true }).click();
	await settled(page);
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		expected
	);
});

test('new editor parameters win over aliases, seek/step/loop/once work with real YouTube', async ({
	page
}) => {
	await page.goto(
		`/?v=${id}&t=31-33&a=1&b=2&once=0&mute=0&vertical=0&orientation=portrait&fill=0&fit=cover`
	);
	await settled(page);
	await expect(page.getByRole('button', { name: 'Landscape', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Crop to fill' })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await expect(page.getByRole('button', { name: 'Loop', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Next frame' }).click();
	await expect.poll(async () => (await mediaState(page)).time).toBeGreaterThan(31);
	await page.getByRole('button', { name: 'Previous frame' }).click();
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await mediaState(page)).state).toBe(1);
	await page.waitForFunction(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { currentTime: number };
		return media.currentTime > 32.5;
	});
	await expect.poll(async () => (await mediaState(page)).time, { timeout: 10000 }).toBeLessThan(32);
	await expect.poll(async () => (await mediaState(page)).state).toBe(1);
	await page.getByRole('button', { name: 'Loop', exact: true }).click();
	await expect.poll(async () => (await mediaState(page)).paused, { timeout: 10000 }).toBe(true);
	expect((await mediaState(page)).time).toBeGreaterThanOrEqual(33);
	await page.getByRole('button', { name: 'Play', exact: true }).click();
	await expect.poll(async () => (await mediaState(page)).time).toBeLessThan(33);
	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await page.getByRole('slider', { name: 'Current time', exact: true }).fill('40');
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		new RegExp('t=31-40')
	);
	await page.getByRole('button', { name: 'B', exact: true }).click();
	await page.getByRole('button', { name: 'A', exact: true }).click();
	// Equal A/B remains a nonempty, duration-validated selection.
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		/t=/
	);
});

for (const path of [`/s?v=${id}&a=31&b=99999&fit=contain`, `/${id}?t=31-&fill=0`]) {
	test(`open end survives duration settlement and reload: ${path}`, async ({ page }) => {
		await page.goto(path);
		await settled(page);
		await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute(
			'href',
			`/?v=${id}&t=31-&fill=0`
		);
		await page.reload();
		await settled(page);
		await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute(
			'href',
			`/?v=${id}&t=31-&fill=0`
		);
	});
}

test('source changes and out-of-duration validation retain editor parity', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(`/?v=${id}&t=90-100&mute`);
	await settled(page);
	expect((await mediaState(page)).duration).toBeLessThan(90);
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).not.toHaveAttribute(
		'href',
		/90-100/
	);
	await page.evaluate(() => navigator.clipboard.writeText('https://youtu.be/jNQXAC9IVRw'));
	await page.getByRole('button', { name: 'Load YouTube URL/ID from clipboard' }).click();
	await settled(page);
	await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
		'href',
		'/jNQXAC9IVRw?mute'
	);
	await page.reload();
	await settled(page);
	expect((await mediaState(page)).duration).toBeLessThan(20);
});

test('existing editor geometry, orientation, provider focus and timeline suites', async ({
	page
}) => {
	await page.goto(`/?v=${id}&t=31-38&mute`);
	await settled(page);
	for (const file of [
		'youtube-orientation',
		'youtube-provider-focus',
		'media-geometry',
		'watch-timeline'
	]) {
		expect((await runModule(page, file)).length).toBeGreaterThan(0);
	}
});

test('canonical watch gestures, mute/unmute, Theater and viewport regressions', async ({
	page
}) => {
	test.setTimeout(90_000);
	await page.goto(`/${id}?t=-15&mute`);
	await settled(page);
	expect(
		(await runModule(page, 'watch-controls', 'run', { audioSuppressed: true })).length
	).toBeGreaterThan(30);
	expect((await runModule(page, 'watch-viewport')).length).toBeGreaterThan(0);
	expect((await runModule(page, 'watch-controls-placement')).length).toBeGreaterThan(0);
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test(`watch Fit/Fill and source geometry at ${viewport.width}x${viewport.height}`, async ({
		page
	}) => {
		await page.setViewportSize(viewport);
		await page.goto(`/${id}?t=31-38&vertical&fill=0&mute`);
		await settled(page);
		const frameWidth = () =>
			page
				.locator('youtube-video')
				.evaluate((el) => el.shadowRoot!.querySelector('iframe')!.getBoundingClientRect().width);
		const fit = await frameWidth();
		await page.goto(`/${id}?t=31-38&vertical&fill&mute`);
		await settled(page);
		expect(await frameWidth()).toBeGreaterThan(fit);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		expect((await runModule(page, 'watch-source-geometry')).length).toBeGreaterThan(0);
	});
}
