import type { YouTubeVideoElement } from '@videojs/html/media/youtube-video';
import type { WatchControlsPlayer } from './watch-controls';

// Run on /s?v=dt-SqNL4z3w&a=0&b=15 after the first frame settles.
// Synthetic touch events verify gesture wiring, not physical Safari toolbar behavior.
export async function run(
	options: { notifyScroll?: boolean; skipViewportSimulation?: boolean } = {}
) {
	const media = document.querySelector<YouTubeVideoElement>('youtube-video')!;
	const root = document.querySelector<WatchControlsPlayer>('youloop-controls-player')!;
	const surface = document.querySelector<HTMLElement>('.video-surface')!;
	const canvas = document.querySelector<HTMLElement>('.media-canvas')!;
	const controls = document.querySelector<HTMLElement>('media-controls')!;
	const playButton = document.querySelector<HTMLButtonElement>('.watch-playback')!;
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
			surface.dispatchEvent(
				new PointerEvent(type, {
					bubbles: true,
					pointerType,
					button: 0,
					isPrimary: true,
					pointerId: 1,
					clientX: 100,
					clientY: 100
				})
			);
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
		check(!document.querySelector('youloop-play-button'), 'No competing visible playback icon');
		check(
			playButton.getAttribute('aria-label')?.includes('video') === true &&
				getComputedStyle(playButton).pointerEvents === 'none',
			'Named keyboard/AT playback target is separate from pointer gestures'
		);
		if (!media.paused) playButton.click();
		await until(() => media.paused, 'Accessible playback activation pauses');
		await settle();
		const title = document.querySelector<HTMLElement>('.video-title')!;
		check(!!title?.textContent, 'Actual provider title shown while paused');
		check(
			getComputedStyle(title).userSelect === 'none' &&
				getComputedStyle(title).pointerEvents === 'none',
			'Title cannot select text or intercept interactions'
		);
		timelineAtVisibleEdge();
		const timeControl = controls.querySelector<HTMLButtonElement>('.watch-time')!;
		const timeline = () => document.querySelector<HTMLElement>('.watch-timeline')!;
		check(
			!timeControl.disabled && timeControl.textContent?.includes('A:B') === true,
			'Settled short range initially uses A:B'
		);
		check(
			timeControl.lastElementChild?.textContent === 'A:B',
			'A:B label follows elapsed time and duration'
		);
		const beforeTime = media.currentTime;
		const beforeGeometry = canvas.getBoundingClientRect().toJSON();
		const beforeUrl = location.href;
		const beforeFrame = iframe;
		const label = timeControl.getAttribute('aria-label');
		check(
			label?.includes('A:B progress, switch to full-video') === true,
			'Time toggle names current mode and destination'
		);
		const tails = document.querySelectorAll<HTMLElement>('.timeline-tail');
		check(
			tails.length === 1 && tails[0].classList.contains('right'),
			'A=0 shows only excluded end tail'
		);
		check(
			getComputedStyle(tails[0]).backgroundImage.includes('repeating-linear-gradient') &&
				getComputedStyle(tails[0]).pointerEvents === 'none',
			'Tail is dashed and inert'
		);
		check(
			Math.abs(
				tails[0].getBoundingClientRect().width / timeline().getBoundingClientRect().width - 0.06
			) < 0.001,
			'Tail has fixed six-percent width'
		);
		check(
			getComputedStyle(document.querySelector('.timeline-fill')!).backgroundColor ===
				'rgb(168, 85, 247)',
			'A:B played selection is purple'
		);
		for (const type of ['pointerdown', 'pointerup'])
			timeControl.dispatchEvent(
				new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true })
			);
		timeControl.click();
		await settle();
		check(
			timeline().dataset.mode === 'video' &&
				!timeControl.querySelector('.time-label') &&
				!timeControl.textContent?.includes('VIDEO'),
			'Full-video toggle removes visible A:B and redundant VIDEO label'
		);
		check(
			getComputedStyle(document.querySelector('.timeline-fill')!).backgroundColor ===
				'rgb(255, 51, 51)',
			'VIDEO progress is red'
		);
		const selection = document.querySelector<HTMLElement>('.timeline-selection')!;
		check(
			parseFloat(selection.style.left) === 0 &&
				Math.abs(
					parseFloat(selection.style.width) -
						(15 / Number(timeline().getAttribute('aria-valuemax'))) * 100
				) < 0.001,
			'VIDEO selection has absolute position and proportional width'
		);
		check(!document.querySelector('.timeline-tail'), 'VIDEO has no decorative tails');
		check(
			getComputedStyle(selection).backgroundColor === 'rgb(51, 153, 255)' &&
				getComputedStyle(selection.querySelector('.timeline-overlap')!).backgroundColor ===
					'rgb(168, 85, 247)',
			'Full-video selection is blue with purple elapsed overlap'
		);
		check(
			selection.getBoundingClientRect().height === 3 &&
				document.querySelector('.timeline-fill')!.getBoundingClientRect().height === 3,
			'Blue selection and purple overlap use the complete three-pixel track'
		);
		check(
			Number(timeline().getAttribute('aria-valuemax')) > 60,
			'VIDEO uses full-duration progress semantics'
		);
		timeControl.click();
		await settle();
		check(
			Number(timeline().getAttribute('aria-valuemax')) === 15,
			'A:B uses clip-duration progress semantics'
		);
		check(
			media.paused && Math.abs(media.currentTime - beforeTime) < 0.2 && location.href === beforeUrl,
			'Time switch does not play, seek or alter URL range'
		);
		check(
			media.shadowRoot?.querySelector('iframe') === beforeFrame &&
				JSON.stringify(canvas.getBoundingClientRect().toJSON()) === JSON.stringify(beforeGeometry),
			'Time switch preserves iframe and geometry'
		);
		const row = controls.getBoundingClientRect();
		const actions = controls.querySelector<HTMLElement>('.watch-actions')!.getBoundingClientRect();
		check(
			timeControl.getBoundingClientRect().right <= actions.left &&
				row.bottom < timeline().getBoundingClientRect().top &&
				actions.right === row.right,
			'Time is left and actions right in the same row above the timeline'
		);

		for (const theater of [false, true]) {
			await scrollTo(theater ? 100 : 0);
			check(mode() === (theater ? 'theater' : 'default'), 'Scroll selects mode without playback');
			check(media.paused, 'Entering mode while paused keeps playback paused');
			check(
				!playButton.closest('[inert]') && !playButton.disabled,
				'Accessible playback remains available in Theater'
			);
			for (const pointer of ['mouse', 'touch']) {
				for (const playing of [true, false]) {
					tap(pointer);
					await until(
						() => (playing ? !media.paused && media.engine?.getPlayerState() === 1 : media.paused),
						`${mode()} ${pointer}: surface tap ${playing ? 'plays' : 'pauses'} real media`
					);
					await settle();
				}
			}
			for (const sequence of ['drag', 'cancel', 'wheel', 'scroll', 'longpress']) {
				const event = (type: string, x = 100) =>
					surface.dispatchEvent(
						new PointerEvent(type, {
							bubbles: true,
							isPrimary: true,
							pointerId: 1,
							pointerType: 'touch',
							button: 0,
							clientX: x,
							clientY: 100
						})
					);
				event('pointerdown');
				if (sequence === 'drag') event('pointermove', 160);
				if (sequence === 'cancel') event('pointercancel');
				if (sequence === 'wheel')
					surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 100 }));
				if (sequence === 'scroll') window.dispatchEvent(new Event('scroll'));
				if (sequence === 'longpress') await wait(300);
				event('pointerup');
				await settle();
				check(media.paused, `${mode()}: ${sequence} never toggles playback`);
			}
			playButton.click();
			await until(
				() => !media.paused && media.engine?.getPlayerState() === 1,
				'Keyboard/AT Play works in either mode'
			);
			await settle();
			playButton.click();
			await until(() => media.paused, 'Keyboard/AT Pause works in either mode');
		}
		await scrollTo(0);
		playButton.click();
		await until(
			() => !media.paused && media.engine?.getPlayerState() === 1,
			'Playback starts for visibility checks'
		);
		await settle();
		check(!document.querySelector('.video-title'), 'Title hidden while playing');
		check(
			!visible() && getComputedStyle(controls).opacity === '0',
			'Default controls hide immediately when playback starts'
		);
		const playingTime = media.currentTime;
		timeControl.click();
		await settle();
		check(
			timeline().dataset.mode === 'video' &&
				!media.paused &&
				media.currentTime >= playingTime &&
				media.currentTime < playingTime + 1,
			'Playing time toggle preserves playback and absolute time'
		);
		media.dispatchEvent(new Event('durationchange'));
		await wait(350);
		check(
			timeline().dataset.mode === 'video',
			'Later settled metadata cannot override manual timeline mode'
		);
		timeControl.click();
		await settle();
		check(
			timeline().dataset.mode === 'clip' && !media.paused,
			'Return to A:B preserves playing state'
		);
		(document.activeElement as HTMLElement)?.blur();
		root.store.toggleControls(true);
		await wait(2300);
		await until(
			() => !visible() && getComputedStyle(controls).opacity === '0',
			'Video.js inactivity hides playing controls'
		);
		timelineAtVisibleEdge();
		tap('mouse');
		await until(() => media.paused, 'Surface remains playable after controls auto-hide');
		tap('touch');
		await until(
			() => !media.paused && media.engine?.getPlayerState() === 1,
			'Touch resumes after hidden-controls pause'
		);
		await settle();
		surface.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
		await settle();
		check(visible(), 'Desktop movement reveals controls');
		const mute = controls.querySelector<HTMLButtonElement>('.watch-actions button')!;
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
		check(visible(), 'Keyboard activity reveals hidden controls');
		playButton.blur();
		const geometry = canvas.getBoundingClientRect().toJSON();
		const time = media.currentTime;
		await scrollTo(100);
		check(
			mode() === 'theater' && !document.querySelector('.watch-timeline') && controls.inert,
			'First down scroll hides Default chrome without a Transport panel'
		);
		check(getComputedStyle(controls).visibility === 'hidden', 'Theater controls are hidden');
		root.store.toggleControls(false);
		await settle();
		await scrollTo(60);
		check(mode() === 'default', 'Up scroll at a nonzero offset restores Default');
		check(
			visible() && getComputedStyle(controls).opacity === '1',
			'Up scroll reveals inactive controls without pointer activity'
		);
		await wait(2300);
		check(
			!visible() && getComputedStyle(controls).opacity === '0',
			'Up-scroll reveal subsequently fades on inactivity'
		);
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
		await scrollTo(originalScroll + 40);
		await scrollTo(originalScroll);
		if (originalMode === 'theater' && mode() !== 'theater') {
			controls.querySelector<HTMLButtonElement>('[aria-label="Theater mode"]')!.click();
		}
		root.store.toggleControls(true);
	}
}
