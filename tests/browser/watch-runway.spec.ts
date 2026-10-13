import { test, expect, type Page } from '@playwright/test';

const path = '/dt-SqNL4z3w/31~38?mute&speed=1.5&fill=0';
async function open(page: Page) {
	await page.goto(path);
	await page.waitForFunction(() => !!document.querySelector('.scroll-runway[style]'));
	await expect(page.locator('youtube-video')).toHaveCount(1);
	await page.waitForFunction(() =>
		document.querySelector('youtube-video')?.shadowRoot?.querySelector('iframe')
	);
}

async function scrollTo(page: Page, y: number) {
	await page.evaluate(async (y) => {
		window.scrollTo({ top: y, behavior: 'instant' });
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
	}, y);
}

for (const viewport of [
	{ width: 1280, height: 800 },
	{ width: 390, height: 844 },
	{ width: 844, height: 390 }
]) {
	test(`shipped runway budget and extensions at ${viewport.width}x${viewport.height}`, async ({
		page
	}, testInfo) => {
		await page.setViewportSize(viewport);
		await open(page);
		const metrics = await page.evaluate(async () => {
			const root = document.scrollingElement!;
			const runway = document.querySelector('.scroll-runway')!;
			const stage = document.querySelector('.stage')!;
			const media = document.querySelector('youtube-video')!;
			const frame = media.shadowRoot!.querySelector('iframe')!;
			const originalFrame = frame.getBoundingClientRect();
			const vh = innerHeight;
			const initial = runway.getBoundingClientRect().height / vh;
			const initialDocument = root.scrollHeight;
			let previous = initial;
			let extensions = 0;
			const samples = [];
			// Half-viewport native scroll steps prevent jumps from hitting the finite end.
			for (let offset = 0.5; offset <= 100; offset += 0.5) {
				window.scrollTo({ top: offset * vh, behavior: 'instant' });
				await new Promise(requestAnimationFrame);
				await new Promise(requestAnimationFrame);
				if (Math.abs(scrollY - offset * vh) > 1) throw new Error('Scroll was clamped');
				const height = runway.getBoundingClientRect().height / vh;
				if (height > previous) extensions++;
				previous = height;
				if ([0.5, 3, 12, 40, 100].includes(offset))
					samples.push({ offset, runway: height, extensions });
			}
			const box = frame.getBoundingClientRect();
			return {
				initial,
				initialDocument,
				extensions,
				final: previous,
				samples,
				snapNodes: document.querySelectorAll('.document-snap-point').length,
				snapType: getComputedStyle(root).scrollSnapType,
				rootScroll: root.scrollTop === scrollY && scrollY === 100 * vh,
				stageTop: stage.getBoundingClientRect().top,
				mediaStable: document.querySelector('youtube-video') === media,
				frameStable: media.shadowRoot!.querySelector('iframe') === frame,
				frameHeight: box.height,
				frameCentered: Math.abs(box.top + box.height / 2 - vh / 2) < 1,
				frameWidthStable: box.width === originalFrame.width,
				horizontalOverflow: root.scrollWidth > innerWidth
			};
		});
		expect(metrics.initial).toBe(4);
		expect(metrics.initialDocument).toBe((4 + 1) * viewport.height);
		expect(metrics.extensions).toBe(4);
		expect(metrics.final).toBe(104);
		expect(metrics.snapNodes).toBe(0);
		expect(metrics.snapType).toBe('none');
		expect(metrics.rootScroll).toBe(true);
		expect(metrics.stageTop).toBe(0);
		expect(metrics.mediaStable && metrics.frameStable && metrics.frameWidthStable).toBe(true);
		expect(metrics.frameHeight).toBe(16000);
		expect(metrics.frameCentered).toBe(true);
		expect(metrics.horizontalOverflow).toBe(false);
		await testInfo.attach('runway-metrics', {
			body: JSON.stringify({ viewport, ...metrics }, null, 2),
			contentType: 'application/json'
		});
	});
}

test('desktop accumulated direction, wheel, button, resize and history', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await open(page);
	const watch = page.locator('.share-prototype');
	await scrollTo(page, 16);
	await expect(watch).toHaveAttribute('data-mode', 'default');
	await scrollTo(page, 31);
	await expect(watch).toHaveAttribute('data-mode', 'default');
	await scrollTo(page, 32);
	await expect(watch).toHaveAttribute('data-mode', 'theater');
	await scrollTo(page, 16);
	await expect(watch).toHaveAttribute('data-mode', 'theater');
	await scrollTo(page, 0);
	await expect(watch).toHaveAttribute('data-mode', 'default');
	// A direction reversal discards accumulated travel from the opposite direction.
	await scrollTo(page, 24);
	await scrollTo(page, 16);
	await scrollTo(page, 40);
	await expect(watch).toHaveAttribute('data-mode', 'default');
	await scrollTo(page, 48);
	await expect(watch).toHaveAttribute('data-mode', 'theater');
	await scrollTo(page, 0);
	await page.mouse.move(195, 200);
	await page.mouse.wheel(0, 80);
	await expect(watch).toHaveAttribute('data-mode', 'theater');
	await page.mouse.wheel(0, -80);
	await expect(watch).toHaveAttribute('data-mode', 'default');
	await page.getByRole('button', { name: 'Theater mode', exact: true }).click();
	await expect(watch).toHaveAttribute('data-mode', 'theater');
	await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(80);
	// Wait for smooth scrolling to finish before testing restoration at a fixed offset.
	await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(281);
	await scrollTo(page, 1000);
	const identity = await page.locator('youtube-video').elementHandle();
	const frame = await page
		.locator('youtube-video')
		.evaluateHandle((el) => el.shadowRoot!.querySelector('iframe'));
	const before = await page
		.locator('.scroll-runway')
		.evaluate((el) => el.getBoundingClientRect().height);
	await page.setViewportSize({ width: 844, height: 390 });
	await page.setViewportSize({ width: 1280, height: 800 });
	expect(
		await page.locator('.scroll-runway').evaluate((el) => el.getBoundingClientRect().height)
	).toBeGreaterThanOrEqual(before);
	expect(
		await page.evaluate((el) => el === document.querySelector('youtube-video'), identity)
	).toBe(true);
	expect(
		await page.evaluate(
			(el) => el === document.querySelector('youtube-video')!.shadowRoot!.querySelector('iframe'),
			frame
		)
	).toBe(true);
	// Exercise SvelteKit's route history, which owns document scroll restoration.
	await page.evaluate(() => {
		const link = document.createElement('a');
		link.href = '/?v=dt-SqNL4z3w&t=31~38&mute&speed=1.5&fill=0';
		link.textContent = 'Runway history editor';
		link.style.cssText = 'position:fixed;top:0;left:0;z-index:9999';
		document.body.append(link);
	});
	await page.getByRole('link', { name: 'Runway history editor' }).click();
	await expect(page.locator('.share-prototype')).toHaveCount(0);
	await page.goBack();
	// SvelteKit history can replace the execution context while restoring the route.
	await page.waitForFunction(
		() => !!document.querySelector('.share-prototype') && scrollY === 1000
	);
	await page.goForward();
	await expect(page.locator('.share-prototype')).toHaveCount(0);
	await page.goBack();
	await page.waitForFunction(
		() => !!document.querySelector('.share-prototype') && scrollY === 1000
	);
	await scrollTo(page, 0);
	await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveAttribute(
		'href',
		'/?v=dt-SqNL4z3w&t=31~38&mute&speed=1.5&fill=0'
	);
});

test.describe('touch-emulated watch runway', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	for (const viewport of [
		{ width: 390, height: 844 },
		{ width: 844, height: 390 }
	]) {
		test(`mobile snap direction, playback and rotation at ${viewport.width}x${viewport.height}`, async ({
			page
		}, testInfo) => {
			await page.setViewportSize(viewport);
			await open(page);
			const watch = page.locator('.share-prototype');
			await expect(watch).toHaveClass(/document-snap/);
			await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
			await page.waitForFunction(() => {
				const media = document.querySelector('youtube-video') as HTMLMediaElement;
				return media?.duration > 0 && media.paused && !document.querySelector('.controls[inert]');
			});
			const markers = await page.locator('.document-snap-point').evaluateAll((nodes) => {
				const positions = nodes.map((node) => node.getBoundingClientRect().top);
				return {
					count: nodes.length,
					spacing: positions
						.slice(1)
						.every((top, index) => Math.abs(top - positions[index] - 20) < 1),
					noninteractive: nodes.every((node) => getComputedStyle(node).pointerEvents === 'none')
				};
			});
			expect(markers.count).toBe(Math.floor((viewport.height * 5) / 20) + 1);
			expect(markers.spacing && markers.noninteractive).toBe(true);
			const original = await page.evaluateHandle(() => {
				const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
				return { media, engine: media.engine, frame: media.shadowRoot!.querySelector('iframe') };
			});
			// Snap offsets are multiples of 20px. Two steps cross the separate 32px threshold.
			for (const [y, mode] of [
				[20, 'default'],
				[40, 'theater'],
				[20, 'theater'],
				[0, 'default']
			] as const) {
				await scrollTo(page, y);
				await expect.poll(() => page.evaluate(() => scrollY)).toBe(y);
				await expect(watch).toHaveAttribute('data-mode', mode);
				if (mode === 'default')
					await expect(
						page.getByRole('button', { name: 'Theater mode', exact: true })
					).toBeVisible();
			}
			// Use the actual playback control so both engines receive a trusted user gesture.
			await page.getByRole('button', { name: 'Play video', exact: true }).press('Enter');
			const playing = () =>
				page
					.locator('youtube-video')
					.evaluate((element) =>
						(
							element as HTMLElement & { engine: { getPlayerState(): number } }
						).engine.getPlayerState()
					);
			await expect.poll(playing).toBe(1);
			const before = await page
				.locator('youtube-video')
				.evaluate((el) => (el as HTMLMediaElement).currentTime);
			await expect
				.poll(() =>
					page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).currentTime)
				)
				.toBeGreaterThan(before + 0.2);
			await scrollTo(page, 0);
			await scrollTo(page, 40);
			await expect(watch).toHaveAttribute('data-mode', 'theater');
			await expect.poll(playing).toBe(1);
			await page.locator('youtube-video').evaluate((el) => (el as HTMLMediaElement).pause());
			const runway = await page
				.locator('.scroll-runway')
				.evaluate((el) => el.getBoundingClientRect().height);
			await page.setViewportSize({ width: viewport.height, height: viewport.width });
			await expect(watch).toHaveClass(/document-snap/);
			expect(
				await page.locator('.scroll-runway').evaluate((el) => el.getBoundingClientRect().height)
			).toBeGreaterThanOrEqual(runway);
			const stable = await page.evaluate((original) => {
				const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
				const frame = media.shadowRoot!.querySelector('iframe')!;
				const box = frame.getBoundingClientRect();
				return {
					media: media === original.media,
					engine: media.engine === original.engine,
					frame: frame === original.frame,
					height: box.height,
					centered: Math.abs(box.top + box.height / 2 - innerHeight / 2) < 1,
					overflow: document.documentElement.scrollWidth > innerWidth,
					root: document.scrollingElement!.scrollTop === scrollY
				};
			}, original);
			expect(stable.media && stable.engine && stable.frame && stable.centered && stable.root).toBe(
				true
			);
			expect(stable.height).toBe(16000);
			expect(stable.overflow).toBe(false);
			await testInfo.attach('mobile-snap-evidence', {
				body: JSON.stringify({ viewport, markers, stable }),
				contentType: 'application/json'
			});
		});
	}
	test('Chromium native touch swipes scroll the root', async ({ page, context, browserName }) => {
		test.skip(browserName !== 'chromium', 'Native swipe injection uses Chromium CDP');
		const session = await context.newCDPSession(page);
		await open(page);
		expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
		await expect(page.locator('.share-prototype.document-snap')).toHaveCount(1);
		await expect(page.locator('html')).toHaveCSS('scroll-snap-type', 'y mandatory');
		await expect(page.locator('.document-snap-point').first()).toBeAttached();
		expect(await page.locator('.document-snap-point').count()).toBeLessThan(10_000);
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: 195, y: 600 }]
		});
		for (const y of [560, 520, 480, 440]) {
			await session.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [{ x: 195, y }]
			});
			await page.evaluate(() => new Promise(requestAnimationFrame));
		}
		await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(32);
		await expect(page.locator('.share-prototype')).toHaveAttribute('data-mode', 'theater');
		expect(await page.evaluate(() => document.scrollingElement!.scrollTop === scrollY)).toBe(true);
		await session.detach();
	});
});
