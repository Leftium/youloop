import { mount, unmount } from 'svelte';
import Fixture from './watch-source-geometry.fixture.svelte';
import { calculateFrameVideoWidth } from './video-framing';

// Run on /s at each phone viewport size. Detection deliberately waits until after first paint.
export async function run() {
	const results: string[] = [];
	const target = document.createElement('div');
	target.style.cssText = 'position:fixed;inset:0;height:100lvh;z-index:9999;background:black';
	document.body.append(target);
	const fixture = mount(Fixture, {
		target,
		props: { youtubeId: new URL(location.href).searchParams.get('v') ?? 'dt-SqNL4z3w' }
	});
	const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 150));
	const check = (condition: boolean, message: string) => {
		if (!condition) throw new Error(message);
		results.push(message);
	};
	try {
		await settle();
		const player = target.querySelector<HTMLElement>('.player')!;
		const canvas = target.querySelector('.media-canvas')!;
		const media = target.querySelector('youtube-video')!;
		const iframe = media.shadowRoot!.querySelector('iframe')!;
		const center = (rect: DOMRect) => [rect.left + rect.width / 2, rect.top + rect.height / 2];
		function geometry(label: string) {
			const outer = player.getBoundingClientRect();
			const bounds = canvas.getBoundingClientRect();
			const frame = iframe.getBoundingClientRect();
			const overlay = target.querySelector('.watch-overlay')!.getBoundingClientRect();
			const timeline = target.querySelector('.watch-timeline')!.getBoundingClientRect();
			const viewport = window.visualViewport!;
			const left = Math.max(bounds.left, viewport.offsetLeft);
			const right = Math.min(bounds.right, viewport.offsetLeft + viewport.width);
			check(
				center(bounds).every((value, i) => Math.abs(value - center(outer)[i]) < 1),
				`${label}: canvas centered on both axes`
			);
			check(
				center(frame).every((value, i) => Math.abs(value - center(bounds)[i]) < 1),
				`${label}: provider frame centered in canvas`
			);
			const ratio = Number(player.style.getPropertyValue('--video-source-ratio'));
			const expected = calculateFrameVideoWidth(bounds.width, bounds.height, ratio, false)!;
			check(
				Math.abs(frame.width - expected) < 1 && frame.height === 16000,
				`${label}: source framing and fixed crop preserved`
			);
			check(
				Math.abs(overlay.left - left) < 1 &&
					Math.abs(overlay.right - right) < 1 &&
					Math.abs(timeline.left - left) < 1 &&
					Math.abs(timeline.right - right) < 1 &&
					timeline.height === 3,
				`${label}: overlay and timeline match visible canvas`
			);
			check(
				Math.abs(timeline.bottom - Math.min(bounds.bottom, viewport.offsetTop + viewport.height)) <
					1,
				`${label}: timeline follows visible bottom`
			);
		}
		geometry('Initial landscape');
		const initial = canvas.getBoundingClientRect();
		fixture.detectPortrait();
		await settle();
		geometry('Detected portrait');
		const detected = canvas.getBoundingClientRect();
		check(
			Math.abs(detected.width / detected.height - 9 / 16) < 0.002 &&
				Math.abs(initial.width / initial.height - 16 / 9) < 0.002,
			'Deferred detection changes actual rendered source geometry'
		);
		check(
			target.querySelector('youtube-video') === media &&
				media.shadowRoot!.querySelector('iframe') === iframe,
			'Source detection preserves provider identity'
		);
		check(
			document.scrollingElement!.scrollWidth === document.scrollingElement!.clientWidth,
			'Dynamic source geometry adds no document overflow'
		);
		return results;
	} finally {
		await unmount(fixture);
		target.remove();
	}
}
