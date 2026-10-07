// YouLoop owns the visible controls; keep cropped provider UI out of Tab navigation.
export function excludeYouTubeProviderFocus(host: HTMLElement): void | (() => void) {
	const root = host.shadowRoot;
	if (!root) return;
	const exclude = () => {
		for (const iframe of root.querySelectorAll('iframe')) {
			if (iframe.tabIndex !== -1) iframe.tabIndex = -1;
		}
	};
	exclude();
	// Video.js/YouTube can insert or replace the iframe and reset its tabindex.
	const observer = new MutationObserver(exclude);
	observer.observe(root, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['tabindex']
	});
	return () => observer.disconnect();
}
