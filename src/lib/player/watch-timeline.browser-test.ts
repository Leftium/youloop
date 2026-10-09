import { createTimelineMode, timelineRange } from './watch-timeline';

export function run() {
	const results: string[] = [];
	const check = (condition: boolean, name: string) => {
		if (!condition) throw new Error(name);
		results.push(name);
	};
	for (const [a, b, expected] of [
		[0, 24, 'clip'],
		[0, 25, 'video'],
		[0, 26, 'video'],
		[0, 99999, 'video']
	] as const) {
		const choice = createTimelineMode();
		check(choice.choose(undefined, a, b) === 'video', 'Unknown duration postpones initial choice');
		check(choice.choose(100, a, b) === expected, `Settled ${b}% range initial mode`);
	}
	const choice = createTimelineMode();
	check(choice.choose(NaN, 31, 38) === 'video', 'Invalid duration postpones choice');
	check(choice.choose(100, 31, 38) === 'clip', 'Short settled range selects A:B');
	check(choice.toggle() === 'video', 'Manual switch to VIDEO');
	check(choice.choose(100, 31, 38) === 'video', 'Time/metadata updates retain manual VIDEO');
	check(choice.choose(200, 0, 20) === 'video', 'Range/duration updates retain manual choice');
	choice.reset();
	check(choice.choose(100, 0, 20) === 'clip', 'New source resets automatic choice');
	choice.reset();
	check(choice.choose(100, 0, 100) === 'video', 'Unrestricted new source selects VIDEO');
	check(
		choice.choose(100, 0, 10) === 'video',
		'Automatic decision is also stable across range updates'
	);
	for (const [a, b, left, right] of [
		[0, 20, false, true],
		[80, 100, true, false],
		[20, 80, true, true],
		[0, 100, false, false]
	] as const) {
		const range = timelineRange(100, a, b, a);
		check(range.leftTail === left && range.rightTail === right, `${a}:${b} conditional tails`);
	}
	const short = timelineRange(1000, 500, 501, 500.5);
	check(
		short.selectionStart === 0.5 && short.selectionWidth === 0.001,
		'Short selection keeps true position and width'
	);
	check(
		short.videoProgress === 0.5005 && short.clipProgress === 0.5 && short.elapsed === 0.5,
		'Absolute and clip progress/time differ'
	);
	for (const [time, expected] of [
		[-1, 0],
		[20, 0],
		[50, 0.5],
		[80, 1],
		[200, 1]
	] as const) {
		const range = timelineRange(100, 20, 80, time);
		check(range.clipProgress === expected, `Clip progress clamps at ${time}`);
	}
	check(timelineRange(100, 20, 80, 20).elapsed === 0, 'Loop return to A resets clip time');
	check(timelineRange(100, 20, 80, 80).elapsed === 60, 'Exact B reports complete clip');
	for (const [duration, a, b, time] of [
		[undefined, 0, 99999, NaN],
		[Infinity, 0, 10, 1],
		[0, 0, 0, 0],
		[100, 50, 50, 50],
		[100, 80, 20, 90]
	] as const) {
		const range = timelineRange(duration, a, b, time);
		check(
			!range.restricted &&
				Object.values(range).every((value) => typeof value !== 'number' || Number.isFinite(value)),
			'Unknown/degenerate range stays finite without toggle'
		);
	}
	const full = timelineRange(100, -10, 99999, 150);
	check(
		full.start === 0 && full.end === 100 && !full.restricted && full.videoProgress === 1,
		'Out-of-bounds range and absolute progress clamp'
	);
	return results;
}

// Run after a fresh /s source settles. Different URL ranges exercise the rendered boundaries.
export async function runView() {
	const results: string[] = [];
	const check = (condition: boolean, name: string) => {
		if (!condition) throw new Error(name);
		results.push(name);
	};
	const button = document.querySelector<HTMLButtonElement>('.watch-time')!;
	const timeline = () => document.querySelector<HTMLElement>('.watch-timeline')!;
	const initial = timeline().dataset.mode;
	const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 80));
	if (initial === 'clip') {
		button.click();
		await settle();
	}
	const total = Number(timeline().getAttribute('aria-valuemax'));
	const params = new URLSearchParams(location.search);
	const range = timelineRange(total, Number(params.get('a')), Number(params.get('b')) || 99999, 0);
	check(
		initial === (range.restricted && range.length / total < 0.25 ? 'clip' : 'video'),
		'Rendered initial mode uses settled range ratio'
	);
	check(button.disabled === !range.restricted, 'Only meaningful ranges enable time toggle');
	const selection = document.querySelector<HTMLElement>('.timeline-selection');
	if (!range.restricted) {
		check(
			!selection && !document.querySelector('.timeline-tail'),
			'Full/degenerate VIDEO has no selection or tails'
		);
		button.click();
		await settle();
		check(timeline().dataset.mode === 'video', 'Unrestricted time display cannot switch');
	} else {
		check(
			!!selection &&
				Math.abs(parseFloat(selection.style.left) - range.selectionStart * 100) < 0.000001 &&
				Math.abs(parseFloat(selection.style.width) - range.selectionWidth * 100) < 0.000001,
			'Rendered cyan selection preserves exact proportional boundaries'
		);
		button.click();
		await settle();
		check(
			timeline().dataset.mode === 'clip' &&
				Number(timeline().getAttribute('aria-valuemax')) === range.length,
			'Rendered A:B progress expands only the clip'
		);
		check(
			!!document.querySelector('.timeline-tail.left') === range.leftTail &&
				!!document.querySelector('.timeline-tail.right') === range.rightTail,
			'Rendered tails follow actual start/end exclusions'
		);
		for (const tail of document.querySelectorAll<HTMLElement>('.timeline-tail')) {
			check(
				Math.abs(
					tail.getBoundingClientRect().width / timeline().getBoundingClientRect().width - 0.06
				) < 0.001,
				'Rendered tail stays fixed size regardless of excluded duration'
			);
		}
		check(
			Number(timeline().getAttribute('aria-valuenow')) >= 0 &&
				Number(timeline().getAttribute('aria-valuenow')) <= range.length,
			'Rendered clip elapsed time is clamped'
		);
		if (initial === 'video') {
			button.click();
			await settle();
		}
	}
	const rect = button.getBoundingClientRect();
	const actions = document.querySelector<HTMLElement>('.watch-actions')!.getBoundingClientRect();
	check(
		rect.right <= actions.left && rect.bottom < timeline().getBoundingClientRect().top,
		'Rendered time target stays left of actions and above track'
	);
	check(
		button.scrollWidth <= button.clientWidth && button.scrollHeight <= button.clientHeight,
		'Time text fits narrow media canvas'
	);
	return results;
}
