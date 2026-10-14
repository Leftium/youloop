import { test, expect, type Page } from '@playwright/test';
import { test as mockedTest, expectMockBootstrap } from './youtube-api.fixture';

const id = 'dt-SqNL4z3w';
const timeline = (page: Page) => page.locator('.watch-timeline');
const scopeButton = (page: Page) => page.locator('.watch-time');
const state = (page: Page) =>
	page.locator('youtube-video').evaluate((element) => {
		const media = element as HTMLElement & {
			currentTime: number;
			paused: boolean;
			duration: number;
			muted: boolean;
			playbackRate: number;
			engine: { getPlayerState(): number };
		};
		return {
			time: media.currentTime,
			paused: media.paused,
			duration: media.duration,
			muted: media.muted,
			speed: media.playbackRate,
			providerState: media.engine.getPlayerState()
		};
	});

async function open(page: Page, path: string) {
	await page.goto(path);
	await expect(scopeButton(page)).not.toContainText('?:??');
	await expect.poll(async () => (await state(page)).paused).toBe(true);
}

async function switchScope(page: Page, mode: 'clip' | 'video') {
	await scopeButton(page).focus();
	await scopeButton(page).click();
	await expect(timeline(page)).toHaveAttribute('data-mode', mode);
}

async function seek(page: Page, time: number) {
	await page.locator('youtube-video').evaluate((element, target) => {
		(element as HTMLElement & { currentTime: number }).currentTime = target;
	}, time);
	await expect.poll(async () => Math.abs((await state(page)).time - time)).toBeLessThan(0.5);
}

async function play(page: Page) {
	await page.getByRole('button', { name: 'Play video', exact: true }).press('Enter');
	await expect.poll(async () => (await state(page)).providerState).toBe(1);
}

for (const route of [`/${id}/5~15`, `/s?v=${id}&a=5&b=15`]) {
	test(`scope switches preserve playback, URL and provider: ${route}`, async ({ page }) => {
		await open(page, `${route}${route.includes('?') ? '&' : '?'}mute&speed=1.5`);
		await expect(timeline(page)).toHaveAttribute('data-mode', 'clip');
		await expect(timeline(page)).toHaveAttribute('aria-valuemax', '10');
		const originalUrl = page.url();
		const editorHref = await page
			.getByRole('link', { name: 'Switch to edit-first mode', exact: true })
			.getAttribute('href');
		await page.evaluate(() => {
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			Object.assign(window, {
				scopeMedia: media,
				scopeFrame: media.shadowRoot!.querySelector('iframe'),
				scopeEngine: media.engine
			});
		});
		await seek(page, 8);
		await switchScope(page, 'video');
		expect(Math.abs((await state(page)).time - 8)).toBeLessThan(0.5);
		expect((await state(page)).paused).toBe(true);
		await switchScope(page, 'clip');
		expect(Math.abs((await state(page)).time - 8)).toBeLessThan(0.5);
		await switchScope(page, 'video');
		await seek(page, 22);
		await switchScope(page, 'clip');
		await expect.poll(async () => Math.abs((await state(page)).time - 5)).toBeLessThan(0.5);
		await expect.poll(async () => (await state(page)).paused).toBe(true);
		await play(page);
		await switchScope(page, 'video');
		await seek(page, 20);
		await expect.poll(async () => (await state(page)).time).toBeGreaterThan(21);
		await switchScope(page, 'clip');
		await expect.poll(async () => (await state(page)).time).toBeLessThan(10);
		await expect.poll(async () => (await state(page)).providerState).toBe(1);
		await switchScope(page, 'video');
		const before = (await state(page)).time;
		await expect.poll(async () => (await state(page)).time).toBeGreaterThan(before + 0.5);
		expect((await state(page)).muted).toBe(true);
		expect((await state(page)).speed).toBe(1.5);
		expect(page.url()).toBe(originalUrl);
		expect(
			await page
				.getByRole('link', { name: 'Switch to edit-first mode', exact: true })
				.getAttribute('href')
		).toBe(editorHref);
		expect(
			await page.evaluate(() => {
				const saved = window as unknown as {
					scopeMedia: Element;
					scopeFrame: Element;
					scopeEngine: unknown;
				};
				const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
				return (
					media === saved.scopeMedia &&
					media.engine === saved.scopeEngine &&
					media.shadowRoot!.querySelector('iframe') === saved.scopeFrame
				);
			})
		).toBe(true);
		await page.reload();
		await expect(scopeButton(page)).not.toContainText('?:??');
		await expect(timeline(page)).toHaveAttribute('data-mode', 'clip');
	});
}

for (const once of [false, true]) {
	mockedTest(
		`selected scope obeys ${once ? 'Once' : 'Loop'} at clip and video end`,
		{ tag: '@youtube-mock' },
		async ({ page }) => {
			test.setTimeout(90_000);
			await open(page, `/${id}/5~8?mute${once ? '&once' : ''}`);
			await expectMockBootstrap(page);
			await play(page);
			await seek(page, 7);
			if (once) {
				await expect.poll(async () => (await state(page)).paused).toBe(true);
				expect(Math.abs((await state(page)).time - 8)).toBeLessThan(0.5);
				await play(page);
				await expect.poll(async () => (await state(page)).time).toBeLessThan(7);
			} else {
				await expect.poll(async () => (await state(page)).time).toBeLessThan(6.5);
				await expect.poll(async () => (await state(page)).providerState).toBe(1);
			}
			await switchScope(page, 'video');
			await seek(page, 7);
			await expect.poll(async () => (await state(page)).time).toBeGreaterThan(9);
			await expect.poll(async () => (await state(page)).providerState).toBe(1);
			const duration = (await state(page)).duration;
			await expect(timeline(page)).toHaveAttribute('aria-valuemax', String(duration));
			await page.getByRole('button', { name: 'Pause video', exact: true }).press('Enter');
			await expect.poll(async () => (await state(page)).paused).toBe(true);
			await seek(page, duration - 4);
			await play(page);
			if (once) {
				await expect.poll(async () => (await state(page)).paused).toBe(true);
				await play(page);
			}
			await expect.poll(async () => (await state(page)).time).toBeLessThan(3);
			await expect.poll(async () => (await state(page)).providerState).toBe(1);
		}
	);
}

test('long, open-ended and complete clips select the right default, including source navigation', async ({
	page
}) => {
	await open(page, `/${id}/5~50?mute`);
	await expect(timeline(page)).toHaveAttribute('data-mode', 'clip');
	await open(page, `/${id}/5?mute`);
	await expect(timeline(page)).toHaveAttribute('data-mode', 'clip');
	await switchScope(page, 'video');
	// Client-side source navigation must reset the local scope choice.
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/b90IRPG5UZs/6?mute';
		link.textContent = 'Change test source';
		document.body.append(link);
	});
	await page.getByRole('link', { name: 'Change test source' }).click();
	await expect(scopeButton(page)).not.toContainText('?:??');
	await expect(timeline(page)).toHaveAttribute('data-mode', 'clip');
	await open(page, `/${id}?mute`);
	await expect(timeline(page)).toHaveAttribute('data-mode', 'video');
	await expect(scopeButton(page)).toBeDisabled();
});
