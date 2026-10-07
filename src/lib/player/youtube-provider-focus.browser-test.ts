import { excludeYouTubeProviderFocus } from './youtube-provider-focus';

// Run with: await (await import('/src/lib/player/youtube-provider-focus.browser-test.ts')).run()
// in the Vite development page's browser console. No YouTube network is needed.
export async function run() {
	const results: string[] = [];
	const host = document.createElement('div');
	const root = host.attachShadow({ mode: 'open' });
	const existing = document.createElement('iframe');
	root.append(existing);
	document.body.append(host);
	const action = excludeYouTubeProviderFocus(host)!;
	const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
	function check(condition: boolean, name: string) {
		if (!condition) throw new Error(name);
		results.push(name);
	}
	try {
		check(existing.tabIndex === -1, 'existing iframe excluded immediately');
		existing.focus();
		check(root.activeElement === existing, 'programmatic iframe focus preserved');
		existing.tabIndex = 0;
		await settle();
		check(existing.tabIndex === -1, 'provider tabindex reset repaired');
		existing.removeAttribute('tabindex');
		await settle();
		check(existing.tabIndex === -1, 'removed tabindex repaired');
		const wrapper = document.createElement('div');
		const inserted = document.createElement('iframe');
		wrapper.append(inserted);
		root.append(wrapper);
		await settle();
		check(inserted.tabIndex === -1, 'asynchronous nested iframe excluded');
		const replacement = document.createElement('iframe');
		existing.replaceWith(replacement);
		await settle();
		check(replacement.tabIndex === -1, 'replacement iframe excluded');
		action.destroy();
		replacement.tabIndex = 0;
		await settle();
		check(replacement.tabIndex === 0, 'observer disconnected on teardown');
		root.replaceChildren();
		const recreated = excludeYouTubeProviderFocus(host)!;
		try {
			const late = document.createElement('iframe');
			root.append(late);
			await settle();
			check(late.tabIndex === -1, 'empty root and recreated action supported');
		} finally {
			recreated.destroy();
		}
		return results;
	} finally {
		action.destroy();
		host.remove();
	}
}
