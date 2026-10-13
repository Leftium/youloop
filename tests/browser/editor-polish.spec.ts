import { test, expect, type Page } from '@playwright/test';
import { parseEditorTime } from '../../src/lib/player/editor-time';
import {
	formatShareBounds,
	serializeShareUrl,
	type TimestampPolicy
} from '../../src/lib/share-url';

const id = 'dt-SqNL4z3w';
const secondId = 'jNQXAC9IVRw';
const preview = (page: Page) => page.getByLabel('Share URL preview', { exact: true });
const input = (page: Page, endpoint = 'start') =>
	page.getByRole('textbox', { name: `Edit ${endpoint}`, exact: true });
async function choosePolicy(page: Page, policy: TimestampPolicy) {
	await page.getByRole('combobox', { name: 'URL timestamp format' }).click();
	await page.locator(`[role="option"][data-policy="${policy}"]`).click();
}

async function open(page: Page, range = '-30.5~-5.25') {
	await page.goto(`/?v=${id}&t=${range}&once&mute&speed=1.5&fill=0`);
	await expect(page.getByRole('button', { name: 'Copy Link', exact: true })).toBeEnabled({
		timeout: 30_000
	});
	await page.waitForFunction(
		() => (document.querySelector('youtube-video') as HTMLMediaElement)?.paused
	);
	await page.evaluate(() => {
		const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
		Object.assign(window, {
			originalMedia: media,
			originalFrame: media.shadowRoot!.querySelector('iframe'),
			originalEngine: media.engine
		});
	});
}
async function identity(page: Page) {
	expect(
		await page.evaluate(() => {
			const saved = window as unknown as {
				originalMedia: Element;
				originalFrame: Element;
				originalEngine: unknown;
			};
			const media = document.querySelector('youtube-video') as HTMLElement & { engine: unknown };
			return (
				media === saved.originalMedia &&
				media.shadowRoot!.querySelector('iframe') === saved.originalFrame &&
				media.engine === saved.originalEngine
			);
		})
	).toBe(true);
}
async function clipboard(page: Page, text = '') {
	await page.evaluate((text) => {
		Object.assign(window, { clipboardText: text });
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				readText: async () => (window as unknown as { clipboardText: string }).clipboardText,
				writeText: async (value: string) => {
					(window as unknown as { clipboardText: string }).clipboardText = value;
				}
			}
		});
	}, text);
}

test.describe('editor polish', () => {
	test('compact settings align pills and switches, preserve precise drafts, and fill the transport', async ({
		page,
		browserName
	}) => {
		await page.setViewportSize({ width: 1920, height: 1080 });
		await open(page, '12.5~59.25');
		await page.getByRole('checkbox', { name: 'Sub-second times' }).check();
		const originalUrl = page.url();
		await expect(page.getByRole('button', { name: 'Edit start from end', exact: true })).toHaveText(
			/^\(≈?-\d+(?::\d{2}){1,2}(?:\.\d{1,2})?\)$/
		);
		const content = page.locator('.settings-content');
		expect(
			await content.evaluate((el) => {
				const pane = el.parentElement!;
				return (
					Math.abs(
						el.getBoundingClientRect().left -
							pane.getBoundingClientRect().left -
							parseFloat(getComputedStyle(pane).paddingLeft)
					) < 1
				);
			})
		).toBe(true);
		expect(
			await content.evaluate(
				(el) => el.getBoundingClientRect().width <= parseFloat(getComputedStyle(el).maxWidth) + 1
			)
		).toBe(true);
		expect(
			await page.locator('.source-link a').evaluate((el) => {
				const range = document.createRange();
				range.selectNodeContents(el);
				return el.getBoundingClientRect().width <= range.getBoundingClientRect().width + 1;
			})
		).toBe(true);
		await expect(page.getByRole('button', { name: 'Change video', exact: true })).toHaveText(
			'Change'
		);
		expect(
			await page.locator('.source-link').evaluate((el) => {
				const children = Array.from(el.querySelectorAll('a,button')).map((item) =>
					item.getBoundingClientRect()
				);
				return children.every(
					(box) => Math.abs(box.top + box.height / 2 - children[0].top - children[0].height / 2) < 1
				);
			})
		).toBe(true);
		for (const name of ['Sound', 'Crop to fill']) {
			const control = page.getByRole('switch', { name, exact: true });
			expect(await control.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
		}
		for (const label of ['Playback speed', 'Repeat mode', 'Media orientation']) {
			const group = page.getByRole('group', { name: label, exact: true });
			expect(
				await group.evaluate((el) => {
					const row = el.closest('.setting-row')!.getBoundingClientRect();
					return (
						Math.abs(el.getBoundingClientRect().right - row.right) < 1 &&
						Array.from(el.querySelectorAll('button')).every(
							(button) =>
								parseFloat(getComputedStyle(button).borderRadius) >=
								button.getBoundingClientRect().height / 2
						)
					);
				})
			).toBe(true);
		}
		await expect(
			page.getByRole('button', { name: 'Landscape', exact: true }).locator('svg')
		).toHaveCount(1);
		await expect(
			page.getByRole('button', { name: 'Portrait', exact: true }).locator('svg')
		).toHaveCount(1);
		await page.getByRole('button', { name: 'Edit start from end', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Set start at playhead' })).toHaveCount(0);
		const duration = Number(
			await page.getByRole('slider', { name: 'Current time', exact: true }).getAttribute('max')
		);
		expect(parseEditorTime(await input(page).inputValue())! + duration).toBeCloseTo(12.5, 1);
		await input(page).press('Enter');
		expect(page.url()).toBe(originalUrl);
		for (const width of [320, 390, 660, 1280]) {
			await page.setViewportSize({ width, height: 844 });
			await expect
				.poll(() =>
					page.locator('.preview-playback').evaluate((el) => {
						const parent = el.parentElement!.getBoundingClientRect();
						const box = el.getBoundingClientRect();
						const fill = el.querySelector('.transport-fill') as HTMLButtonElement;
						return (
							Math.abs(box.width - parent.width) < 1 &&
							Math.abs(box.right - parent.right) < 1 &&
							fill.disabled &&
							fill.tabIndex === -1
						);
					})
				)
				.toBe(true);
			await page.getByRole('button', { name: 'Edit end from end', exact: true }).click();
			await expect(page.getByRole('button', { name: 'Set end at playhead' })).toHaveCount(0);
			expect(
				await page.locator('[data-endpoint="end"]').evaluate((el) => {
					const row = el.getBoundingClientRect();
					return Array.from(el.querySelectorAll('input,button')).every((child) => {
						const box = child.getBoundingClientRect();
						return box.left >= row.left - 1 && box.right <= row.right + 1;
					});
				})
			).toBe(true);
			await input(page, 'end').press('Escape');
			await expect
				.poll(() =>
					page.locator('#editor-settings').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
				)
				.toBe(true);
			await identity(page);
		}
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.screenshot({ path: `/tmp/youloop39-refined-${browserName}.png` });
	});
	test('two-decimal drafts preserve incoming precision until an explicit edit', async ({
		page
	}) => {
		await open(page, '1.2345~12.3456');
		const original = page.url();
		for (const [endpoint, draft] of [
			['start', '0:01.23'],
			['end', '0:12.35']
		]) {
			await page.getByRole('button', { name: `Edit ${endpoint} from start`, exact: true }).click();
			await expect(input(page, endpoint)).toHaveValue(draft);
			await input(page, endpoint).press('Enter');
			expect(page.url()).toBe(original);
		}
		await page.getByRole('checkbox', { name: 'Sub-second times' }).check();
		await page.getByRole('button', { name: 'Edit start from start', exact: true }).click();
		await input(page).fill('3.456');
		await input(page).press('Enter');
		await expect(page.getByRole('alert')).toContainText('at most 2 decimal places');
		expect(page.url()).toBe(original);
		await input(page).fill('3.45');
		await input(page).press('Enter');
		await expect(page).toHaveURL(/t=3\.45~12\.3456/);
		await identity(page);
	});

	test('fractional presentation, unchanged drafts, signed edits, safe blur and repair', async ({
		page
	}) => {
		await open(page);
		const original = page.url();
		const originalPreview = await preview(page).textContent();
		const precision = page.getByRole('checkbox', { name: 'Sub-second times' });
		await expect(precision).not.toBeChecked();
		await expect(page.getByRole('button', { name: 'Edit end from end', exact: true })).toHaveText(
			'(≈-0:05)'
		);
		await page.getByRole('button', { name: 'Edit end from end', exact: true }).click();
		await expect(input(page, 'end')).toHaveValue('-0:05.25');
		await input(page, 'end').press('Enter');
		expect(page.url()).toBe(original);
		await precision.check();
		await expect(page.getByRole('button', { name: 'Edit end from end', exact: true })).toHaveText(
			'(-0:05.25)'
		);
		await precision.uncheck();
		expect(page.url()).toBe(original);
		await page.getByRole('button', { name: 'Edit start from end', exact: true }).click();
		await expect(input(page)).toHaveValue('-0:30.5');
		await input(page).fill('-30.25');
		await expect(preview(page)).toHaveText(originalPreview!);
		await input(page).press('Enter');
		await expect(page.getByRole('alert')).toContainText('enable Sub-second times');
		expect(page.url()).toBe(original);
		await precision.check();
		await input(page).press('Enter');
		await expect(page).toHaveURL(/t=-30\.25~-5\.25/);
		await page.getByRole('button', { name: 'Edit start from start', exact: true }).click();
		await expect(input(page)).not.toHaveValue(/^-/);
		await input(page).fill('10.25');
		await page.getByRole('button', { name: 'Apply', exact: true }).click();
		await expect(page).toHaveURL(/t=10\.25~-5\.25/);
		await page.getByRole('button', { name: 'Edit start from start', exact: true }).click();
		await input(page).fill('12');
		// Traverse the actual focus order, which differs with WebKit keyboard preferences.
		for (let step = 0; step < 8; step++) {
			await page.keyboard.press('Tab');
			if (!(await input(page).count())) break;
		}
		await expect(page).toHaveURL(/t=12~-5\.25/);
		await page.getByRole('button', { name: 'Edit end from end', exact: true }).click();
		await input(page, 'end').fill('-0');
		await input(page, 'end').press('Enter');
		await expect(page.getByRole('alert')).toContainText('instead of -0');
		await input(page, 'end').fill('1');
		await input(page, 'end').press('Enter');
		await expect(page.getByRole('alert')).toContainText('End after Start');
		await input(page, 'end').press('Escape');
		await expect(
			page.getByRole('button', { name: 'Edit end from end', exact: true })
		).toBeFocused();
		await precision.uncheck();
		await page.getByRole('slider', { name: 'Current time', exact: true }).fill('15.5');
		await page.getByRole('button', { name: 'Set start at playhead' }).click();
		await expect(page).toHaveURL(/t=16~-5\.25/);
		await precision.check();
		await page.locator('youtube-video').evaluate((media) => {
			(media as HTMLMediaElement).currentTime = 18.25;
			media.dispatchEvent(new Event('timeupdate'));
		});
		await page.waitForFunction(
			() => !(document.querySelector('youtube-video') as HTMLMediaElement).seeking
		);
		await page.getByRole('button', { name: 'Set start at playhead' }).click();
		const preciseStart = Number(
			await page.getByRole('slider', { name: 'Repeat start', exact: true }).inputValue()
		);
		expect(preciseStart).toBeCloseTo(18.25, 1);
		expect(Number.isInteger(preciseStart)).toBe(false);
		await identity(page);
	});

	test('all live URL policies agree with Open and Copy, preserve bounds and provider', async ({
		page
	}) => {
		await open(page, '12.5~59.25');
		await clipboard(page);
		const duration = await page
			.locator('youtube-video')
			.evaluate((media) => (media as HTMLMediaElement).duration);
		const committed = {
			videoId: id,
			start: 12.5,
			end: 59.25,
			once: true,
			mute: true,
			speed: 1.5,
			fill: false
		};
		for (const policy of [
			'preserve',
			'shortest',
			'from-start',
			'mixed',
			'from-end',
			'preserve'
		] as TimestampPolicy[]) {
			await page.getByRole('combobox', { name: 'URL timestamp format' }).click();
			for (const option of [
				'preserve',
				'shortest',
				'from-start',
				'mixed',
				'from-end'
			] as TimestampPolicy[]) {
				await expect(page.locator(`[role=option][data-policy="${option}"] small`)).toHaveText(
					serializeShareUrl(formatShareBounds(committed, duration, option)!)
				);
			}
			await page.keyboard.press('End');
			await expect(page.locator('[role=option][data-policy="from-end"]')).toBeFocused();
			await page.keyboard.press('ArrowUp');
			await expect(page.locator('[role=option][data-policy="mixed"]')).toBeFocused();
			await page.keyboard.press('Home');
			await expect(page.locator('[role=option][data-policy="preserve"]')).toBeFocused();
			await page.keyboard.press('Escape');
			await expect(page.getByRole('combobox', { name: 'URL timestamp format' })).toBeFocused();
			await choosePolicy(page, policy);
			const expected = serializeShareUrl(formatShareBounds(committed, duration, policy)!);
			await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
				'href',
				expected
			);
			await expect(preview(page)).toHaveText(`http://localhost:5173${expected}`);
			await page.getByRole('button', { name: 'Copy Link', exact: true }).click();
			expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
				`http://localhost:5173${expected}`
			);
			await expect(page.getByRole('slider', { name: 'Repeat start', exact: true })).toHaveValue(
				'12.5'
			);
			await expect(page.getByRole('slider', { name: 'Repeat end', exact: true })).toHaveValue(
				'59.25'
			);
			await identity(page);
		}
		await page.getByRole('button', { name: 'Edit end from end', exact: true }).click();
		await page.getByRole('button', { name: 'End of video', exact: true }).click();
		await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
			'href',
			`/${id}/12.5?once&mute&speed=1.5&fill=0`
		);
		await expect(page.getByRole('button', { name: 'Edit end from end', exact: true })).toHaveText(
			'End of video'
		);
		await choosePolicy(page, 'from-start');
		await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
			'href',
			`/${id}/12.5~${duration}?once&mute&speed=1.5&fill=0`
		);
		await page.reload();
		await expect(page.getByRole('button', { name: 'Copy Link', exact: true })).toBeEnabled();
		await expect(page.getByRole('combobox', { name: 'URL timestamp format' })).toHaveAttribute(
			'data-value',
			'preserve'
		);
		await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
			'href',
			`/${id}/12.5~${duration}?once&mute&speed=1.5&fill=0`
		);
	});

	test('dialog source drafts, supported links, clipboard previews and title freshness', async ({
		page
	}) => {
		await open(page);
		const title = page.getByLabel('YouTube video title', { exact: true });
		await expect(title).toContainText('BFX 2011');
		const original = page.url();
		await page.getByRole('button', { name: 'Change video', exact: true }).click();
		const source = page.getByRole('textbox', {
			name: 'YouTube URL, ID, or YouLoop link',
			exact: true
		});
		await source.fill(secondId);
		await identity(page);
		expect(page.url()).toBe(original);
		await source.press('Escape');
		await expect(page.getByRole('button', { name: 'Change video', exact: true })).toBeFocused();
		await page.getByRole('button', { name: 'Change video', exact: true }).click();
		await source.fill('bad');
		await source.press('Enter');
		await expect(page.getByRole('dialog').getByRole('status')).toContainText('YouLoop clip link');
		await identity(page);
		await clipboard(page, `https://youloop.app/${id}/10.25~-3.5?mute&speed=0.5`);
		await page.getByRole('button', { name: 'Paste from clipboard' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Load', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Change video', exact: true })).toBeFocused();
		await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
			'href',
			`/${id}/10.25~-3.5?mute&speed=0.5`
		);
		await identity(page); // Compatible same-source links only update state.
		await clipboard(page, `https://www.youtube.com/shorts/${secondId}`);
		await page.getByRole('button', { name: 'Change video', exact: true }).click();
		await page.getByRole('button', { name: 'Paste from clipboard' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Load', exact: true }).click();
		await expect(
			page.getByRole('link', { name: `youtu.be/${secondId}`, exact: true })
		).toHaveAttribute('href', `https://youtu.be/${secondId}`);
		await expect(title).not.toContainText('BFX 2011');
		await expect(title).toContainText('Me at the zoo', { timeout: 30_000 });
		await expect(page.getByRole('link', { name: 'Open video', exact: true })).toHaveAttribute(
			'href',
			`/${secondId}?mute`
		);
		await expect(page.getByRole('textbox')).toHaveCount(0);
		await page.getByRole('button', { name: 'Change video', exact: true }).click();
		await source.fill(id);
		await source.press('Enter');
		await expect(page.getByRole('button', { name: 'Change video', exact: true })).toBeFocused();
		await expect(title).toContainText('BFX 2011', { timeout: 30_000 });
		await page.evaluate(() =>
			Object.defineProperty(navigator, 'clipboard', {
				configurable: true,
				value: {
					readText: async () => {
						throw new Error('Denied');
					}
				}
			})
		);
		await page.getByRole('button', { name: 'Change video', exact: true }).click();
		await page.getByRole('button', { name: 'Paste from clipboard' }).click();
		await expect(page.getByRole('dialog').getByRole('status')).toContainText(
			'Clipboard unavailable'
		);
	});

	test('late metadata refreshes a read-only long title without requests or remounts', async ({
		page
	}) => {
		await page.addInitScript(() => {
			Object.assign(window, { delayedTitle: '' });
			window.addEventListener(
				'message',
				(event) => {
					if (!event.origin.includes('youtube')) return;
					try {
						const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
						if (message?.info?.videoData) {
							message.info.videoData.title = (
								window as unknown as { delayedTitle: string }
							).delayedTitle;
							Object.defineProperty(event, 'data', {
								value: typeof event.data === 'string' ? JSON.stringify(message) : message
							});
						}
					} catch {
						/* Ignore non-provider messages. */
					}
				},
				true
			);
		});
		await open(page);
		const title = page.getByLabel('YouTube video title', { exact: true });
		await expect(title).toHaveText('Loading video title...');
		await expect(title).toHaveText('Video title unavailable', { timeout: 10_000 });
		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		const longTitle = 'Late provider title '.repeat(30);
		await page.evaluate((title) => {
			(window as unknown as { delayedTitle: string }).delayedTitle = title;
			const engine = (
				document.querySelector('youtube-video') as HTMLElement & {
					engine: { getVideoData: () => object };
				}
			).engine;
			const read = engine.getVideoData.bind(engine);
			engine.getVideoData = () => ({ ...read(), title });
		}, longTitle);
		await expect(title).toHaveText(longTitle);
		await expect(title).toHaveAttribute('title', longTitle);
		await page.setViewportSize({ width: 320, height: 568 });
		expect(await title.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(45);
		await expect(page.getByRole('textbox')).toHaveCount(0);
		expect(requests.filter((url) => /oembed|metadata|title/i.test(url))).toEqual([]);
		await identity(page);
	});

	test('pane-responsive transport is stable, synchronized, accessible, and retains media', async ({
		page,
		browserName
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await open(page, '5~50');
		for (const name of ['Clip', 'Playback', 'Framing'])
			await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
		const transport = page.getByRole('group', { name: 'Player transport' });
		const positions = () =>
			transport.locator('button').evaluateAll((buttons) =>
				buttons.map((button) => {
					const rect = button.getBoundingClientRect();
					return [rect.x, rect.y, rect.width, rect.height];
				})
			);
		const original = await positions();
		for (const rate of [2, 1, 0.5, 0.25]) {
			await page.getByRole('button', { name: `${rate}x speed`, exact: true }).click();
			await expect(transport.locator('.speed-value')).toHaveText(`${rate}x`);
			expect(await positions()).toEqual(original);
		}
		await page.getByRole('button', { name: 'Play', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		expect(await positions()).toEqual(original);
		await page.getByRole('button', { name: 'Pause', exact: true }).click();
		await transport.locator('.transport-sound').click();
		await expect(page.getByRole('switch', { name: 'Sound', exact: true })).toBeChecked();
		await transport.locator('.transport-loop').click();
		await expect(page.getByRole('button', { name: 'Loop', exact: true })).toHaveAttribute(
			'aria-pressed',
			'true'
		);
		expect(await positions()).toEqual(original);
		const layout = page.locator('.workspace-layout button');
		await layout.focus();
		await expect(layout).not.toHaveAttribute('title');
		expect(await layout.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('1');
		await page.getByRole('separator', { name: 'Resize video preview' }).press('Home');
		await expect(transport.locator('.play-label')).toBeHidden();
		await expect(transport.locator('.transport-loop')).toBeHidden();
		await page.getByRole('separator', { name: 'Resize video preview' }).press('End');
		await expect(transport.locator('.play-label')).toBeVisible();
		for (const width of [320, 390, 660, 844, 1280]) {
			await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
			expect(
				await transport.evaluate((el) => {
					const rect = el.getBoundingClientRect();
					const pane = document.querySelector('#editor-preview')!.getBoundingClientRect();
					return rect.right <= pane.right && rect.height === 44;
				})
			).toBe(true);
			await expect
				.poll(() =>
					page.locator('#editor-settings').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
				)
				.toBe(true);
			await identity(page);
		}
		await page.setViewportSize({ width: 1280, height: 800 });
		await layout.press('Enter');
		await expect(page.locator('.workspace-grid')).toHaveAttribute('data-layout', 'rows');
		await expect(layout).toHaveAttribute('data-tooltip', 'Switch to side-by-side layout');
		const content = page.locator('.settings-content');
		expect(
			await content.evaluate(
				(el) =>
					Math.abs(
						parseFloat(getComputedStyle(el).marginLeft) -
							parseFloat(getComputedStyle(el).marginRight)
					) < 1
			)
		).toBe(true);
		await expect(transport.locator('.speed-value')).toBeHidden();
		await expect(transport.locator('.transport-speed .secondary-label')).toBeVisible();
		for (const rate of [2, 1, 0.5, 0.25]) {
			const button = transport.getByRole('button', {
				name: `Set playback speed to ${rate}x`,
				exact: true
			});
			await expect(button).toBeVisible();
			await button.click();
			await expect(transport.locator('.speed-value')).toHaveText(`${rate}x`);
			await expect(
				page.getByRole('button', { name: `${rate}x speed`, exact: true })
			).toHaveAttribute('aria-pressed', 'true');
		}
		await page.setViewportSize({ width: 900, height: 800 });
		await expect(transport.locator('.frame-label').first()).toBeVisible();
		await expect(transport.locator('.transport-rate').first()).toBeHidden();
		await expect(transport.locator('.speed-value')).toBeVisible();
		await expect(transport.locator('.speed-value')).toHaveText('0.25x');
		await page.setViewportSize({ width: 1280, height: 800 });
		await identity(page);
		await page.screenshot({ path: `/tmp/youloop39-${browserName}-stacked.png` });
	});
});
