import { mount, unmount } from 'svelte';
import Fixture from './watch-source-geometry.fixture.svelte';
import { placeWatchControls, placeWatchTitle } from './watch-controls-placement';

// Run on /s in a viewport at least 844 x 740. Uses real button geometry and
// injected visual viewports; physical Safari chrome still needs device testing.
export async function run() {
	const results: string[] = [];
	const check = (condition: boolean, message: string) => {
		if (!condition) throw new Error(message);
		results.push(message);
	};
	const wait = async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, 300));
		for (let frame = 0; frame < 5; frame++)
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	};
	const viewport = window.visualViewport!;
	const keys = ['width', 'height', 'offsetLeft', 'offsetTop'] as const;
	const descriptors = keys.map((key) => Object.getOwnPropertyDescriptor(viewport, key));
	const target = document.createElement('div');
	target.style.cssText =
		'position:fixed;left:0;top:0;z-index:9999;background:black;margin:0;padding:0';
	document.body.append(target);
	const fixture = mount(Fixture, { target, props: { youtubeId: 'dt-SqNL4z3w' } });
	function resize(width: number, height: number, left = 0, top = 0) {
		target.style.width = `${width}px`;
		target.style.height = `${height}px`;
		Object.defineProperties(viewport, {
			width: { configurable: true, value: width - left },
			height: { configurable: true, value: height - top },
			offsetLeft: { configurable: true, value: left },
			offsetTop: { configurable: true, value: top }
		});
		viewport.dispatchEvent(new Event('resize'));
	}
	try {
		resize(844, 390);
		await wait();
		fixture.detectPortrait();
		await wait();
		const controls = target.querySelector<HTMLElement>('media-controls')!;
		const media = target.querySelector('youtube-video')!;
		const iframe = media.shadowRoot?.querySelector('iframe');
		const buttons = [...controls.querySelectorAll<HTMLButtonElement>('button')];
		const time = buttons[0];
		const actions = controls.querySelector<HTMLElement>('.watch-actions')!;
		function geometry(label: string, mode: string) {
			const canvas = target.querySelector('.media-canvas')!.getBoundingClientRect();
			const row = controls.getBoundingClientRect();
			const timeBounds = time.getBoundingClientRect();
			const actionBounds = actions.getBoundingClientRect();
			check(
				controls.dataset.placement === mode,
				`${label}: expected ${mode}, got ${controls.dataset.placement}, canvas=${JSON.stringify(canvas.toJSON())}, row=${JSON.stringify(row.toJSON())}, time=${timeBounds.width}, actions=${actionBounds.width}, region=${JSON.stringify(target.querySelector('.watch-controls-region')!.getBoundingClientRect().toJSON())}`
			);
			check(timeBounds.right <= actionBounds.left, `${label}: groups never overlap`);
			for (const button of buttons) {
				const bounds = button.getBoundingClientRect();
				check(
					bounds.width >= 44 &&
						bounds.height >= 44 &&
						bounds.left >= viewport.offsetLeft &&
						bounds.top >= viewport.offsetTop &&
						bounds.right <= viewport.offsetLeft + viewport.width + 1 &&
						bounds.bottom <= viewport.offsetTop + viewport.height + 1,
					`${label}: touch target fits visible viewport`
				);
			}
			if (mode === 'sides')
				check(
					timeBounds.right < canvas.left && actionBounds.left > canvas.right,
					`${label}: both groups outside picture: time=${timeBounds.right}, canvas=${canvas.left}..${canvas.right}, actions=${actionBounds.left}`
				);
			if (mode === 'below') check(row.top > canvas.bottom, `${label}: row below picture`);
			if (mode === 'above') check(row.bottom < canvas.top, `${label}: row above picture`);
			const timeline = target.querySelector('.watch-timeline')!.getBoundingClientRect();
			check(
				Math.abs(timeline.bottom - Math.min(canvas.bottom, viewport.offsetTop + viewport.height)) <
					1 && timeline.height === 3,
				`${label}: timeline stays on picture`
			);
			check(
				buttons.every((button, index) => controls.querySelectorAll('button')[index] === button) &&
					target.querySelector('youtube-video') === media &&
					media.shadowRoot?.querySelector('iframe') === iframe,
				`${label}: controls and provider retain identity`
			);
			check(
				document.scrollingElement!.scrollWidth === document.scrollingElement!.clientWidth,
				`${label}: no horizontal overflow`
			);
		}
		geometry('Delayed portrait detection', 'sides');
		for (const [width, height, orientation, mode] of [
			[390, 740, 'landscape', 'below'],
			[844, 390, 'landscape', 'video'],
			[844, 475, 'landscape', 'video'],
			[240, 180, 'landscape', 'video'],
			[320, 100, 'portrait', 'video'],
			[844, 390, 'portrait', 'sides']
		] as const) {
			resize(width, height);
			fixture.configure({ orientation });
			await wait();
			geometry(`${width}x${height} ${orientation}`, mode);
		}
		// Browser chrome can remove the lower gutter, leaving a usable upper one.
		resize(390, 740);
		fixture.configure({ orientation: 'landscape', fill: true });
		await wait();
		const canvas = target.querySelector('.media-canvas')!.getBoundingClientRect();
		Object.defineProperty(viewport, 'height', { configurable: true, value: canvas.bottom + 30 });
		viewport.dispatchEvent(new Event('resize'));
		await wait();
		geometry('Expanded lower browser chrome', 'above');
		const region = target.querySelector<HTMLElement>('.watch-controls-region')!;
		region.style.padding = '30px 40px 34px 44px';
		resize(844, 390, 20, 10);
		fixture.configure({ orientation: 'portrait', fill: false });
		await wait();
		geometry('Offset viewport and safe areas', 'sides');
		check(
			time.getBoundingClientRect().left >= 64 && actions.getBoundingClientRect().right <= 804,
			'Safe-area padding protects both groups'
		);
		const scroll = window.scrollY;
		for (const view of [
			{ controlPageVisible: true },
			{ controlPageVisible: false, theater: true }
		]) {
			fixture.configure(view);
			await wait();
			check(
				controls.inert && getComputedStyle(controls).visibility === 'hidden',
				'Overlay or Theater hides and inerts quick controls'
			);
			time.focus({ preventScroll: true });
			check(document.activeElement !== time, 'Suppressed controls cannot take keyboard focus');
		}
		fixture.configure({ theater: false });
		await wait();
		check(
			!controls.inert &&
				getComputedStyle(controls).visibility === 'visible' &&
				window.scrollY === scroll,
			'Dismissal restores same controls without scrolling'
		);
		const tight = placeWatchControls(
			{ left: 40, top: 30, right: 350, bottom: 180 },
			{ left: 0, top: 0, right: 390, bottom: 200 },
			{ time: 100, actions: 140, height: 44 }
		);
		check(
			tight.mode === 'video' &&
				tight.left >= 40 &&
				tight.left + tight.width <= 350 &&
				tight.top + tight.height <= 180,
			'No usable gutter falls back inside safe bounds'
		);
		const titleSafe = { left: 12, top: 12, right: 832, bottom: 376 };
		const portrait = { left: 312, top: 0, right: 532, bottom: 390 };
		const sideTitle = placeWatchTitle(
			titleSafe,
			portrait,
			{ left: 200, top: 332, width: 490, height: 44 },
			60
		);
		check(
			sideTitle.mode === 'left' && sideTitle.left + sideTitle.width < portrait.left,
			'Portrait title uses side gutter above controls'
		);
		const landscape = { left: 0, top: 260, right: 390, bottom: 480 };
		const upperTitle = placeWatchTitle(
			{ left: 12, top: 12, right: 378, bottom: 726 },
			landscape,
			{ left: 12, top: 492, width: 366, height: 44 },
			60
		);
		check(
			upperTitle.mode === 'above' && upperTitle.top + 60 < landscape.top,
			'Landscape title uses upper gutter while controls use lower gutter'
		);
		const fallbackTitle = placeWatchTitle(
			titleSafe,
			{ left: 0, top: 0, right: 844, bottom: 390 },
			{ left: 12, top: 332, width: 820, height: 44 },
			60
		);
		check(
			fallbackTitle.mode === 'video' && fallbackTitle.top + fallbackTitle.maxHeight < 332,
			'Title fallback reserves space above controls'
		);
		const wrappedTitle = placeWatchTitle(
			{ left: 12, top: 12, right: 1940, bottom: 1247 },
			{ left: 0, top: 81.5, right: 1952, bottom: 1179.5 },
			{ left: 12, top: 1191.5, width: 1928, height: 44 },
			(width) => (width <= 420 ? 74 : 45)
		);
		check(
			wrappedTitle.mode === 'above',
			'Title uses a wider upper gutter at reported 1952x1261 boundary'
		);
		return results;
	} finally {
		await unmount(fixture);
		target.remove();
		keys.forEach((key, index) => {
			if (descriptors[index]) Object.defineProperty(viewport, key, descriptors[index]!);
			else Reflect.deleteProperty(viewport, key);
		});
		viewport.dispatchEvent(new Event('resize'));
	}
}

// Run on a settled, paused /s. Change only the canvas ratio to exercise title
// geometry without reloading the provider or changing its title/playback state.
export async function runTitle() {
	const player = document.querySelector<HTMLElement>('.player')!;
	const canvas = document.querySelector<HTMLElement>('.media-canvas')!;
	const title = document.querySelector<HTMLElement>('.video-title')!;
	if (!title) throw new Error('Wait for the paused title to load');
	const originalRatio = canvas.style.getPropertyValue('--media-ratio');
	const originalText = title.textContent;
	const viewport = window.visualViewport!;
	const originalHeight = Object.getOwnPropertyDescriptor(viewport, 'height');
	const results: string[] = [];
	const check = (condition: boolean, label: string) => {
		if (!condition) throw new Error(label);
		results.push(label);
	};
	const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
	try {
		for (const ratio of [9 / 16, 16 / 9]) {
			canvas.style.setProperty('--media-ratio', String(ratio));
			await wait();
			const picture = canvas.getBoundingClientRect();
			const bounds = title.getBoundingClientRect();
			const controls = document.querySelector('media-controls')!.getBoundingClientRect();
			const outside =
				bounds.right <= picture.left ||
				bounds.left >= picture.right ||
				bounds.bottom <= picture.top ||
				bounds.top >= picture.bottom;
			check(
				title.dataset.placement !== 'video' && outside,
				`${ratio}: paused title moves outside picture`
			);
			check(
				bounds.right <= controls.left ||
					bounds.left >= controls.right ||
					bounds.bottom <= controls.top ||
					bounds.top >= controls.bottom,
				`${ratio}: title avoids controls`
			);
			check(
				bounds.left >= 0 &&
					bounds.top >= 0 &&
					bounds.right <= viewport.width &&
					bounds.bottom <= viewport.height,
				`${ratio}: title fits visible viewport`
			);
			check(
				title.scrollHeight <= title.clientHeight + 1 && title.scrollWidth <= title.clientWidth + 1,
				`${ratio}: complete title fits its gutter`
			);
		}
		canvas.style.setProperty('--media-ratio', String(player.clientWidth / player.clientHeight));
		await wait();
		check(title.dataset.placement === 'video', 'Matching viewport falls back to in-picture title');
		Object.defineProperty(viewport, 'height', { configurable: true, value: viewport.height - 100 });
		viewport.dispatchEvent(new Event('resize'));
		await wait();
		check(
			title.getBoundingClientRect().bottom <= viewport.height,
			'Title respects expanded browser chrome'
		);
		check(
			getComputedStyle(title).pointerEvents === 'none' &&
				getComputedStyle(title).userSelect === 'none',
			'Margin title remains inert and unselectable'
		);
		// At this boundary the full-width fallback fits one line, but a 420px
		// gutter needs two. A decision based on the previous width flickers.
		if (originalHeight) Object.defineProperty(viewport, 'height', originalHeight);
		else Reflect.deleteProperty(viewport, 'height');
		title.textContent = 'BFX 2011 - Flying and Falling (Class demo) - Chris and Campbell';
		canvas.style.setProperty(
			'--media-ratio',
			String(player.clientWidth / (player.clientHeight - 132))
		);
		viewport.dispatchEvent(new Event('resize'));
		await wait();
		const stable = title.dataset.placement;
		for (let frame = 0; frame < 12; frame++) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			check(
				title.dataset.placement === stable,
				'Title placement stays stable across boundary frames'
			);
		}
		title.textContent = originalText;
		return results;
	} finally {
		title.textContent = originalText;
		if (originalRatio) canvas.style.setProperty('--media-ratio', originalRatio);
		else canvas.style.removeProperty('--media-ratio');
		if (originalHeight) Object.defineProperty(viewport, 'height', originalHeight);
		else Reflect.deleteProperty(viewport, 'height');
		viewport.dispatchEvent(new Event('resize'));
	}
}
