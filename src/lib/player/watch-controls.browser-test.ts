import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
import type { WatchControlsPlayer } from './watch-controls';

// Run on /s?v=dt-SqNL4z3w&a=0&b=120 after the first frame settles.
// Synthetic touch events verify gesture wiring, not physical Safari toolbar behavior.
export async function run(
	options: { notifyScroll?: boolean; skipViewportSimulation?: boolean } = {}
) {
	const media = document.querySelector<YouTubeVideoElement>('youtube-video')!;
	const root = document.querySelector<WatchControlsPlayer>('youloop-controls-player')!;
	const surface = document.querySelector<HTMLElement>('.video-surface')!;
	const canvas = document.querySelector<HTMLElement>('.media-canvas')!;
	const controls = document.querySelector<HTMLElement>('media-controls')!;
	const playButton = document.querySelector<HTMLElement>('youloop-play-button')!;
	const page = document.querySelector<HTMLElement>('.share-prototype')!;
	const iframe = media?.shadowRoot?.querySelector('iframe');
	if (!root || !iframe || media.readyState < 1)
		throw new Error('Wait for the watch player to load');
	const results: string[] = [];
	const originalPaused = media.paused;
	const originalScroll = window.scrollY;
	const originalMode = page.dataset.mode;
	const originalTransition = controls.style.transition;
	controls.style.transition = 'none';
	const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 70));
	const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	const check = (condition: boolean, name: string) => {
		if (!condition) throw new Error(name);
		results.push(name);
	};
	async function until(condition: () => boolean, name: string) {
		const deadline = Date.now() + 10000;
		while (!condition() && Date.now() < deadline) await settle();
		check(condition(), name);
	}
	function tap(pointerType: string) {
		for (const type of ['pointerdown', 'pointerup']) {
			surface.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType, button: 0 }));
		}
	}
	const mode = () => page.dataset.mode;
	const visible = () => root.store.controlsVisible;
	async function scrollTo(y: number) {
		window.scrollTo({ top: y, behavior: 'instant' });
		// Hidden automation pages may defer native scroll events until a rendered frame.
		if (options.notifyScroll) window.dispatchEvent(new Event('scroll'));
		await settle();
	}
	function timelineAtVisibleEdge() {
		const bounds = canvas.getBoundingClientRect();
		const viewport = window.visualViewport!;
		const timeline = document.querySelector<HTMLElement>('.watch-timeline')!;
		const expected = Math.min(bounds.bottom, viewport.offsetTop + viewport.height);
		check(
			Math.abs(timeline.getBoundingClientRect().bottom - expected) < 1,
			'Timeline follows visible canvas edge'
		);
		check(timeline.getBoundingClientRect().height === 3, 'Thin timeline persists');
	}
	try {
		await scrollTo(100);
		await scrollTo(0);
		check(mode() === 'default', 'Up scroll returns to Default');
		check(
			getComputedStyle(media).pointerEvents === 'none' && !media.hasAttribute('controls'),
			'Provider Play drawing remains noninteractive'
		);
		check(
			!document.querySelector('.video-toggle'),
			'No full-surface playback button in watch view'
		);
		check(
			document.querySelectorAll('youloop-play-button').length === 1,
			'One explicit inline playback control'
		);
		if (!media.paused) playButton.click();
		await until(() => media.paused, 'Explicit pause works');
		await settle();
		check(
			!!document.querySelector('.video-title')?.textContent,
			'Actual provider title shown while paused'
		);
		tap('mouse');
		tap('touch');
		await settle();
		check(
			media.paused && getComputedStyle(controls).opacity === '1',
			'Paused background taps preserve playback and reachable controls'
		);
		timelineAtVisibleEdge();
		playButton.click();
		await until(
			() => !media.paused && media.engine?.getPlayerState() === 1,
			'Explicit Play starts real YouTube playback'
		);
		await settle();
		check(!document.querySelector('.video-title'), 'Title hidden while playing');
		(document.activeElement as HTMLElement)?.blur();
		root.store.toggleControls(true);
		await wait(2300);
		await until(
			() => !visible() && getComputedStyle(controls).opacity === '0',
			'Video.js inactivity hides playing controls'
		);
		timelineAtVisibleEdge();
		for (const pointer of ['mouse', 'touch']) {
			root.store.toggleControls(false);
			tap(pointer);
			await settle();
			check(visible() && !media.paused, `${pointer}: hidden controls revealed without pausing`);
			tap(pointer);
			await settle();
			check(!visible() && !media.paused, `${pointer}: visible controls dismissed without pausing`);
		}
		surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
		await settle();
		check(visible(), 'Desktop movement reveals controls');
		const mute = controls.querySelector<HTMLButtonElement>('button')!;
		const originalMute = media.muted;
		mute.click();
		await until(() => media.muted !== originalMute, 'Mute control updates real media');
		check(visible() && !media.paused, 'Control click does not trigger background gesture');
		mute.click();
		await until(() => media.muted === originalMute, 'Unmute restores media');
		root.store.toggleControls(false);
		playButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		playButton.focus({ preventScroll: true });
		await settle();
		check(visible(), 'Keyboard focus reveals hidden controls');
		playButton.blur();
		const geometry = canvas.getBoundingClientRect().toJSON();
		const time = media.currentTime;
		await scrollTo(100);
		check(
			mode() === 'theater' && !document.querySelector('.watch-timeline') && controls.inert,
			'First down scroll hides Default chrome without a Transport panel'
		);
		check(getComputedStyle(controls).visibility === 'hidden', 'Theater controls are hidden');
		await scrollTo(60);
		check(mode() === 'default', 'Up scroll at a nonzero offset restores Default');
		timelineAtVisibleEdge();
		check(media.currentTime >= time && !media.paused, 'Playback continues across mode changes');
		check(
			JSON.stringify(canvas.getBoundingClientRect().toJSON()) === JSON.stringify(geometry),
			'Mode changes preserve canvas geometry'
		);
		check(
			media.shadowRoot?.querySelector('iframe') === iframe &&
				iframe.getBoundingClientRect().height === 16000,
			'Mode changes preserve iframe identity and fixed crop'
		);
		const runway = document.querySelector<HTMLElement>('.scroll-runway')!;
		const runwayHeight = runway.getBoundingClientRect().height;
		await scrollTo(document.documentElement.scrollHeight - window.innerHeight * 5);
		check(
			runway.getBoundingClientRect().height > runwayHeight,
			'Native runway extends before its end'
		);
		await scrollTo(window.scrollY - 100);
		check(mode() === 'default', 'Up direction works after runway extension');
		controls.querySelector<HTMLButtonElement>('[aria-label="Theater mode"]')!.click();
		await until(() => mode() === 'theater', 'Theater button advances logical mode');
		await wait(700);
		check(mode() === 'theater', 'Theater remains selected after smooth scrolling');
		await scrollTo(window.scrollY - 100);
		check(mode() === 'default', 'Up scroll reverses explicit Theater entry');
		if (!options.skipViewportSimulation) {
			const viewport = window.visualViewport!;
			const originalHeight = Object.getOwnPropertyDescriptor(viewport, 'height');
			try {
				Object.defineProperty(viewport, 'height', {
					configurable: true,
					value: Math.max(100, canvas.getBoundingClientRect().bottom - 80)
				});
				viewport.dispatchEvent(new Event('resize'));
				await settle();
				timelineAtVisibleEdge();
				check(
					JSON.stringify(canvas.getBoundingClientRect().toJSON()) === JSON.stringify(geometry),
					'Viewport-only chrome changes move timeline without reframing'
				);
			} finally {
				if (originalHeight) Object.defineProperty(viewport, 'height', originalHeight);
				else Reflect.deleteProperty(viewport, 'height');
				viewport.dispatchEvent(new Event('resize'));
			}
		}
		return results;
	} finally {
		controls.style.transition = originalTransition;
		if (media.paused !== originalPaused) playButton.click();
		await scrollTo(0);
		await scrollTo(originalScroll);
		if (originalMode === 'theater' && mode() !== 'theater') {
			controls.querySelector<HTMLButtonElement>('[aria-label="Theater mode"]')!.click();
		}
		root.store.toggleControls(true);
	}
}
