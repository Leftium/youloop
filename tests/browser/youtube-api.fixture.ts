import { test as base, expect, type Page } from '@playwright/test';

// Inspired by upstream MockPlayer's public API surface, implemented independently
// against @videojs/youtube-video 10.1.0's installed adapter and iframe-api modules.
function installYouTubeApi() {
	if (window !== window.top) return;
	type Listener = (event: { data: number }) => void;
	const metrics = { starts: 0, mutedStarts: 0, pauses: 0, seeks: 0, destroyed: 0 };
	Object.assign(window, { youtubeMockMetrics: metrics });
	class Player {
		private listeners = new Map<string, Set<Listener>>();
		private state = -1;
		private time = 0;
		private rate = 1;
		private volume = 100;
		private muted = false;
		private duration = 60;
		private videoId: string;
		private destroyed = false;
		private timer: ReturnType<typeof setInterval>;
		constructor(
			private target: HTMLIFrameElement,
			options: { events: { onReady: () => void } }
		) {
			this.videoId = new URL(target.src).pathname.split('/').pop()!;
			// Fixed increments give the adapter's real 50ms poll a predictable clock.
			this.timer = setInterval(() => {
				if (this.state !== 1) return;
				this.time = Math.min(this.duration, this.time + 0.05 * this.rate);
				if (this.time >= this.duration) this.changeState(0);
			}, 50);
			setTimeout(() => {
				if (!this.destroyed) options.events.onReady();
			}, 0);
		}
		addEventListener(type: string, listener: Listener) {
			if (!this.listeners.has(type)) this.listeners.set(type, new Set());
			this.listeners.get(type)!.add(listener);
		}
		private emit(type: string, data = 0) {
			this.listeners.get(type)?.forEach((listener) => listener({ data }));
		}
		private changeState(state: number) {
			this.state = state;
			this.emit('onStateChange', state);
		}
		playVideo() {
			metrics.starts++;
			if (this.muted) metrics.mutedStarts++;
			if (this.time >= this.duration) this.time = 0;
			// Mimic cued versus post-playback duration, forcing normal settling.
			this.duration = 60.25;
			this.changeState(1);
		}
		pauseVideo() {
			metrics.pauses++;
			this.changeState(2);
		}
		seekTo(time: number) {
			metrics.seeks++;
			this.time = Math.max(0, Math.min(this.duration, time));
		}
		cueVideoById(options: { videoId: string; startSeconds?: number }) {
			this.videoId = options.videoId;
			this.time = options.startSeconds ?? 0;
			this.duration = 60;
			this.changeState(5);
		}
		loadVideoById(options: { videoId: string; startSeconds?: number }) {
			this.cueVideoById(options);
			this.playVideo();
		}
		stopVideo() {
			this.changeState(-1);
		}
		getCurrentTime() {
			return this.time;
		}
		getDuration() {
			return this.duration;
		}
		getPlayerState() {
			return this.state;
		}
		getVideoLoadedFraction() {
			return 1;
		}
		getPlaybackRate() {
			return this.rate;
		}
		setPlaybackRate(rate: number) {
			this.rate = rate;
			this.emit('onPlaybackRateChange');
		}
		getVolume() {
			return this.volume;
		}
		setVolume(volume: number) {
			this.volume = volume;
			this.emit('onVolumeChange');
		}
		isMuted() {
			return this.muted;
		}
		mute() {
			this.muted = true;
			this.emit('onVolumeChange');
		}
		unMute() {
			this.muted = false;
			this.emit('onVolumeChange');
		}
		getVideoData() {
			return { video_id: this.videoId, title: 'YouTube API test video' };
		}
		getIframe() {
			return this.target;
		}
		getOption() {
			return undefined;
		}
		destroy() {
			this.destroyed = true;
			clearInterval(this.timer);
			this.listeners.clear();
			metrics.destroyed++;
		}
	}
	Object.assign(window, { YT: { Player, ready: (callback: () => void) => callback() } });
}

export async function expectMockBootstrap(page: Page) {
	if (process.env.YOULOOP_LIVE_PROOF === '1') return;
	const snapshot = await page.locator('youtube-video').evaluate((element) => {
		const media = element as HTMLMediaElement;
		const metrics = (window as unknown as { youtubeMockMetrics: Record<string, number> })
			.youtubeMockMetrics;
		return { paused: media.paused, duration: media.duration, ...metrics };
	});
	expect(snapshot.paused).toBe(true);
	expect(snapshot.duration).toBe(60.25);
	expect(snapshot.starts).toBe(1);
	expect(snapshot.mutedStarts).toBe(1);
	expect(snapshot.pauses).toBeGreaterThan(0);
	expect(snapshot.seeks).toBeGreaterThan(0);
}

export const test = base.extend<{ youtubeApi: void }>({
	youtubeApi: [
		async ({ context, page }, use, testInfo) => {
			if (!testInfo.tags.includes('@youtube-mock')) return use();
			const live = process.env.YOULOOP_LIVE_PROOF === '1';
			let intercepted = 0;
			let externalResponses = 0;
			let fulfilled = 0;
			let externalRequests = 0;
			let embedRequests = 0;
			context.on('request', (request) => {
				if (!['localhost', '127.0.0.1'].includes(new URL(request.url()).hostname))
					externalRequests++;
				if (/youtube(?:-nocookie)?\.com\/embed\//.test(request.url())) embedRequests++;
			});
			context.on('response', (response) => {
				if (!['localhost', '127.0.0.1'].includes(new URL(response.url()).hostname))
					externalResponses++;
			});
			if (!live) {
				await context.route('**/*', async (route) => {
					if (['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname)) {
						return route.continue();
					}
					intercepted++;
					if (
						route.request().resourceType() === 'document' &&
						/youtube(?:-nocookie)?\.com$/.test(new URL(route.request().url()).hostname)
					) {
						fulfilled++;
						return route.fulfill({
							contentType: 'text/html',
							body: '<!doctype html><title>API mock iframe</title>'
						});
					}
					return route.abort('blockedbyclient');
				});
				await context.addInitScript(installYouTubeApi);
			}
			await use();
			if (!live) {
				await page.locator('youtube-video').evaluate((element) => element.remove());
				await expect
					.poll(() =>
						page.evaluate(
							() =>
								(window as unknown as { youtubeMockMetrics: Record<string, number> })
									.youtubeMockMetrics.destroyed
						)
					)
					.toBe(1);
			}
			const metrics = live
				? null
				: await page.evaluate(
						() =>
							(window as unknown as { youtubeMockMetrics: Record<string, number> })
								.youtubeMockMetrics
					);
			await testInfo.attach('youtube-api-metrics', {
				body: JSON.stringify({
					live,
					intercepted,
					fulfilled,
					externalRequests,
					externalResponses,
					embedRequests,
					metrics
				}),
				contentType: 'application/json'
			});
			if (!live) {
				expect(intercepted).toBeGreaterThan(0);
				expect(externalRequests).toBe(intercepted);
				expect(externalResponses).toBe(fulfilled);
				// Fulfilled iframe responses are local; no external route may continue.
				expect(metrics!.mutedStarts).toBeGreaterThan(0);
				expect(metrics!.pauses).toBeGreaterThan(0);
				expect(metrics!.seeks).toBeGreaterThan(0);
			}
		},
		{ auto: true }
	]
});
