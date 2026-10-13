import { test, expect, type Page } from '@playwright/test';

const id = 'dt-SqNL4z3w';
const state = (page: Page) =>
	page.locator('youtube-video').evaluate((element) => {
		const media = element as HTMLElement & {
			duration: number;
			currentTime: number;
			paused: boolean;
			engine: unknown;
		};
		return { duration: media.duration, time: media.currentTime, paused: media.paused };
	});
async function settled(page: Page) {
	await expect(page.locator('.watch-time, .timestamps')).not.toContainText('?:??');
	await expect.poll(async () => (await state(page)).paused).toBe(true);
}

test('signed fractions survive watch/editor/copy/reload/history and explicit bound edits', async ({
	page
}) => {
	const watch = `/${id}/-30.5~-5.25?once&mute&speed=1.5&vertical=0&fill=0`;
	const editor = `/?v=${id}&t=-30.5~-5.25&once&mute&speed=1.5&vertical=0&fill=0`;
	await page.goto(watch);
	await settled(page);
	const duration = (await state(page)).duration;
	await expect(page.locator('.watch-timeline')).toHaveAttribute('aria-valuemax', '25.25');
	await expect
		.poll(async () => Math.abs((await state(page)).time - (duration - 30.5)))
		.toBeLessThan(0.5);
	await expect(
		page.getByRole('link', { name: 'Switch to edit-first mode', exact: true })
	).toHaveAttribute('href', editor);
	await page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		Object.assign(window, {
			savedMedia: media,
			savedFrame: media.shadowRoot!.querySelector('iframe'),
			savedEngine: media.engine
		});
	});
	await page.locator('.watch-time').click();
	await expect(page.locator('.watch-timeline')).toHaveAttribute('data-mode', 'video');
	await expect(page).toHaveURL('http://localhost:5173' + watch);
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
				media.engine === saved.savedEngine &&
				media.shadowRoot?.querySelector('iframe') === saved.savedFrame
			);
		})
	).toBe(true);
	await page.getByRole('link', { name: 'Switch to edit-first mode', exact: true }).click();
	await settled(page);
	for (const [name, expected] of [
		['Repeat start', duration - 30.5],
		['Repeat end', duration - 5.25]
	] as const) {
		expect(
			Math.abs(
				Number(await page.getByRole('slider', { name, exact: true }).inputValue()) - expected
			)
		).toBeLessThan(0.000001);
	}
	await page.reload();
	await settled(page);
	await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
		'href',
		new URL(watch, 'http://localhost:5173').href
	);
	await page.goBack();
	await settled(page);
	await expect(page).toHaveURL('http://localhost:5173' + watch);
	await page.goForward();
	await settled(page);
	await page.getByRole('slider', { name: 'Repeat start', exact: true }).fill('20');
	await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
		'href',
		new URL(`/${id}/20~-5.25?once&mute&speed=1.5&vertical=0&fill=0`, 'http://localhost:5173').href
	);
});

for (const once of [false, true]) {
	test(`signed range obeys ${once ? 'Once' : 'Loop'} at resolved B`, async ({ page }) => {
		await page.goto(`/${id}/-8~-5?mute${once ? '&once' : ''}`);
		await settled(page);
		const end = (await state(page)).duration - 5;
		await page.locator('youtube-video').evaluate((element, time) => {
			(element as HTMLElement & { currentTime: number }).currentTime = time;
		}, end - 0.5);
		// Let YouTube acknowledge the paused seek before testing boundary playback.
		await page.waitForFunction(
			() => !(document.querySelector('youtube-video') as HTMLMediaElement).seeking
		);
		await expect.poll(async () => (await state(page)).time).toBeGreaterThan(end - 1);
		await page.getByRole('button', { name: 'Play video', exact: true }).press('Enter');
		if (once) {
			await expect.poll(async () => (await state(page)).time).toBeGreaterThanOrEqual(end - 0.01);
			await expect.poll(async () => (await state(page)).paused).toBe(true);
		} else {
			await expect.poll(async () => (await state(page)).time).toBeLessThan(end - 1);
			expect((await state(page)).paused).toBe(false);
		}
	});
}

test('invalid resolved and collapsed clips pause without rewriting their identity', async ({
	page
}) => {
	for (const range of ['60~-30', '90~100', '-30~0', '~-1000']) {
		await page.goto(`/${id}/${range}?mute`);
		await expect(page.getByRole('alert')).toContainText('Invalid clip');
		await expect.poll(async () => (await state(page)).paused).toBe(true);
		await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
		await expect(page).toHaveURL(`http://localhost:5173/${id}/${range}?mute`);
	}
	for (const path of [`/${id}?t=31-38`, `/${id}/~`, `/${id}/bad`, `/${id}/`, `/${id}/31~38/`]) {
		await page.goto(path);
		await expect(page.getByRole('alert')).toContainText('Invalid link');
		await expect(page.locator('youtube-video')).toHaveCount(0);
	}
});

for (const flags of ['mute', 'once&mute&speed=1.5&vertical=0&fill=0']) {
	test(`invalid watch clips retain Edit and can be repaired: ${flags}`, async ({ page }) => {
		const watch = `/${id}/60~-30?${flags}`;
		const editor = `/?v=${id}&t=60~-30&${flags}`;
		await page.goto(watch);
		await expect(page.getByRole('alert')).toContainText('Invalid clip');
		await expect.poll(async () => (await state(page)).paused).toBe(true);
		await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled();
		await expect(page).toHaveURL('http://localhost:5173' + watch);
		const edit = page.getByRole('link', { name: 'Switch to edit-first mode', exact: true });
		await expect(edit).toBeVisible();
		await expect(edit).toHaveAttribute('href', editor);
		await edit.click();
		await expect(page).toHaveURL('http://localhost:5173' + editor);
		await expect(page.getByRole('alert')).toContainText('Invalid clip');
		await expect(
			page.getByRole('link', { name: 'Share URL', exact: true, includeHidden: true })
		).toHaveCount(0);
		await page.getByRole('slider', { name: 'Repeat start', exact: true }).fill('5');
		const repaired = `/${id}/5~-30?${flags}`;
		await expect(page.getByRole('alert')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Share URL', exact: true })).toHaveAttribute(
			'href',
			new URL(repaired, 'http://localhost:5173').href
		);
		await page.getByRole('link', { name: 'Share URL', exact: true }).click();
		await settled(page);
		await expect(page).toHaveURL('http://localhost:5173' + repaired);
		await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeEnabled();
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
}

for (const scope of ['clip', 'video'] as const) {
	test(`same-source range navigation preserves provider and restores bounds on Back: ${scope}`, async ({
		page
	}) => {
		const watch = `/${id}/-30~-5?mute`;
		const next = `/${id}/5~15?mute`;
		const timeline = page.locator('.watch-timeline');
		await page.goto(watch);
		await settled(page);
		await expect(timeline).toHaveAttribute('aria-valuemax', '25');
		if (scope === 'video') await page.locator('.watch-time').click();
		await expect(timeline).toHaveAttribute('data-mode', scope);
		await page.evaluate((next) => {
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			Object.assign(window, {
				savedMedia: media,
				savedEngine: media.engine,
				savedFrame: media.shadowRoot!.querySelector('iframe')
			});
			const link = document.createElement('a');
			link.href = next;
			link.textContent = 'Change range';
			document.body.append(link);
		}, next);
		const assertProvider = async () =>
			expect(
				await page.evaluate(() => {
					const saved = window as unknown as {
						savedMedia: Element;
						savedEngine: unknown;
						savedFrame: Element;
					};
					const media = document.querySelector('youtube-video') as HTMLElement & {
						engine: unknown;
					};
					return (
						media === saved.savedMedia &&
						media.engine === saved.savedEngine &&
						media.shadowRoot?.querySelector('iframe') === saved.savedFrame
					);
				})
			).toBe(true);
		// Locator.click scrolls this offscreen link into view. Back restores that
		// scroll position and enters Theater, which intentionally hides the timeline.
		// Native link activation keeps SvelteKit navigation without that scroll.
		await page
			.getByRole('link', { name: 'Change range' })
			.evaluate((link) => (link as HTMLAnchorElement).click());
		await expect(page).toHaveURL('http://localhost:5173' + next);
		await settled(page);
		await expect(timeline).toHaveAttribute('data-mode', scope);
		if (scope === 'clip') await expect(timeline).toHaveAttribute('aria-valuemax', '10');
		await assertProvider();
		await page.goBack();
		await expect(page).toHaveURL('http://localhost:5173' + watch);
		await settled(page);
		expect(await page.evaluate(() => scrollY)).toBe(0);
		await expect(page.locator('.share-prototype')).toHaveAttribute('data-mode', 'default');
		await expect(timeline).toHaveAttribute('data-mode', scope);
		await expect(
			page.getByRole('link', { name: 'Switch to edit-first mode', exact: true })
		).toHaveAttribute('href', `/?v=${id}&t=-30~-5&mute`);
		await assertProvider();
		// Check resolved A/B as well as signed intent, even when VIDEO was selected.
		if (scope === 'video') await page.locator('.watch-time').click();
		await expect(timeline).toHaveAttribute('aria-valuemax', '25');
		await expect
			.poll(async () => {
				const media = await state(page);
				return Math.abs(media.time - (media.duration - 30));
			})
			.toBeLessThan(0.5);
	});
}
