<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Player from './Player.svelte';
	import { createOrientationController, type Orientation } from './youtube-orientation';
	import {
		parsePlayerUrl,
		normalizeShareUrl,
		serializeShareUrl,
		serializeEditorUrl,
		type ShareUrlState
	} from '#lib/share-url.ts';

	let {
		minimal = false,
		theater = false,
		ontheater
	}: {
		minimal?: boolean;
		theater?: boolean;
		ontheater?: () => void;
	} = $props();

	const initial = untrack(() => parsePlayerUrl(new URL(page.url.href)));
	const initialClip = initial.ok ? initial.value : { videoId: 'dt-SqNL4z3w' };

	let youtubeId = $state(initialClip.videoId);
	let repeatA = $state(initialClip.start ?? 0);
	let repeatB = $state(initialClip.end ?? 99999);
	let endOpen = $state(initialClip.end === undefined);
	let once = $state(initialClip.once ?? false);
	let mute = $state<boolean | undefined>(initialClip.mute);
	let speed = $state<number | undefined>(initialClip.speed);
	let vertical = $state<boolean | undefined>(initialClip.vertical);
	let fill = $state<boolean | undefined>(initialClip.fill);
	let orientation = $state<Orientation>('landscape');
	let sourceOrientation = $state<Orientation>('landscape');
	let sourceAspectRatio = $state(16 / 9);
	let fillFrame = $derived(fill ?? orientation !== sourceOrientation);
	let ready = $state(false);
	let loaded = $state(initial.ok);
	let error = $state(
		initial.ok ? '' : `Invalid link: ${initial.errors.map((item) => item.parameter).join(', ')}`
	);
	let copyMessage = $state('');
	let controller: ReturnType<typeof createOrientationController>;
	let loadedHref = '';
	let bareDemo = false;
	let demoState = '';

	let clip = $derived<ShareUrlState>({
		videoId: youtubeId,
		start: repeatA,
		end: endOpen ? undefined : repeatB,
		once,
		mute,
		speed,
		vertical,
		fill
	});
	let normalized = $derived(normalizeShareUrl(clip));
	let sharePath = $derived(normalized.ok ? serializeShareUrl(normalized.value) : undefined);
	let editorPath = $derived(normalized.ok ? serializeEditorUrl(normalized.value) : undefined);

	onMount(() => {
		controller = createOrientationController((frame, _override, source) => {
			orientation = frame;
			if (source) {
				sourceOrientation = source.orientation;
				sourceAspectRatio =
					source.aspectRatio ?? (source.orientation === 'portrait' ? 9 / 16 : 16 / 9);
			}
		});
		ready = true;
		return () => controller.dispose();
	});

	function loadUrl(url: URL) {
		loadedHref = url.href;
		bareDemo = ['/', '/s'].includes(url.pathname) && !url.searchParams.has('v');
		const result = parsePlayerUrl(url);
		if (!result.ok) {
			error = `Invalid link: ${result.errors.map((item) => item.parameter).join(', ')}`;
			loaded = false;
			return;
		}
		const value = result.value;
		error = '';
		copyMessage = '';
		youtubeId = value.videoId;
		repeatA = value.start ?? 0;
		repeatB = value.end ?? 99999;
		endOpen = value.end === undefined;
		once = value.once ?? false;
		mute = value.mute;
		speed = value.speed;
		vertical = value.vertical;
		fill = value.fill;
		controller.setSource(
			youtubeId,
			vertical === undefined ? null : vertical ? 'portrait' : 'landscape',
			true
		);
		demoState = serializeShareUrl(value);
		loaded = true;
	}

	$effect(() => {
		void page.url;
		if (!ready) return;
		// Back can reuse data from before a shallow edit. The restored browser URL
		// owns live clip state, rather than the cached server request's URL.
		const url = new URL(window.location.href);
		if (url.href !== loadedHref) untrack(() => loadUrl(url));
	});

	$effect(() => {
		if (!ready || !loaded || !sharePath || !editorPath) return;
		const path = minimal ? sharePath : editorPath;
		untrack(() => {
			// Keep demo selection out of the bare root's URL and social identity.
			if (bareDemo && sharePath === demoState) return;
			const next = new URL(path, page.url.href);
			if (next.href === loadedHref) return;
			bareDemo = false;
			loadedHref = next.href;
			// Retain SvelteKit's history bookkeeping; edits replace rather than spam Back.
			replaceState(next, page.state);
		});
	});

	async function copyLink() {
		if (!sharePath) return;
		try {
			await navigator.clipboard.writeText(new URL(sharePath, page.url.origin).href);
			copyMessage = 'Link copied';
		} catch {
			copyMessage = 'Clipboard unavailable. Copy the link below.';
		}
	}
</script>

{#if error}
	<p role="alert">{error}</p>
	<a href="/">Open editor</a>
{:else}
	<!-- One shared state owner; presentation changes never duplicate the media engine. -->
	{#if loaded}
		<Player
			bind:youtubeId
			bind:repeatA
			bind:repeatB
			{once}
			{mute}
			{speed}
			{orientation}
			{fillFrame}
			{sourceAspectRatio}
			{minimal}
			{editorPath}
			{theater}
			{ontheater}
			ononcechange={(value) => (once = value)}
			onmutechange={(value) => (mute = value)}
			onspeedchange={(value) => (speed = value)}
			onendchange={() => (endOpen = false)}
			onfillchange={(value) => (fill = value)}
			onorientationchange={(value) => {
				vertical = value === 'portrait';
				fill = undefined;
				controller.choose(value);
			}}
			onsourcechange={(videoId) => {
				endOpen = true;
				vertical = undefined;
				fill = undefined;
				speed = undefined;
				controller.setSource(videoId, null, true);
			}}
		>
			{#snippet editorActions()}
				{#if !minimal}
					<a class="secondary" href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>
				{/if}
				{#if !minimal}
					<nav aria-label="Clip navigation">
						<a href={sharePath}>Open video</a>
						<button onclick={copyLink} disabled={!sharePath}>Copy Link</button>
						{#if copyMessage}
							<span role="status">{copyMessage}</span>
							{#if copyMessage.startsWith('Clipboard')}<a href={sharePath}>{sharePath}</a>{/if}
						{/if}
					</nav>
				{/if}
				{#if !normalized.ok}<p role="alert">
						Choose an end after the start to share this clip.
					</p>{/if}
			{/snippet}
		</Player>
	{/if}
{/if}

<style>
	nav {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
	}
	button {
		margin: 0;
	}
</style>
