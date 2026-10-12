<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import Player from './Player.svelte';
	import { createOrientationController, type Orientation } from './youtube-orientation';
	import {
		parseShareUrl,
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

	const initial = untrack(() => {
		const url = page.url;
		return ['/', '/s'].includes(url.pathname) && !url.search
			? normalizeShareUrl({ videoId: 'dt-SqNL4z3w', start: 31, end: 38 })
			: parseShareUrl(url.href);
	});
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
		bareDemo = ['/', '/s'].includes(url.pathname) && !url.searchParams.has('v') && !url.search;
		const result = bareDemo
			? normalizeShareUrl({ videoId: 'dt-SqNL4z3w', start: 31, end: 38 })
			: parseShareUrl(url);
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
		const url = page.url;
		if (ready && url.href !== loadedHref) untrack(() => loadUrl(new URL(url.href)));
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
	{#if !minimal}
		<a class="secondary" href="https://youtu.be/{youtubeId}">youtu.be/{youtubeId}</a>
	{/if}
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
		/>
	{/if}
	<nav class:watch-navigation={minimal} hidden={minimal && theater} aria-label="Clip navigation">
		{#if minimal}<a href={editorPath}>Edit</a>{:else}<a href={sharePath}>Open video</a>{/if}
		<button onclick={copyLink} disabled={!sharePath}>Copy Link</button>
		{#if copyMessage}
			<span role="status">{copyMessage}</span>
			{#if copyMessage.startsWith('Clipboard')}<a href={sharePath}>{sharePath}</a>{/if}
		{/if}
	</nav>
	{#if !normalized.ok}<p role="alert">Choose an end after the start to share this clip.</p>{/if}
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
	.watch-navigation {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 2;
		padding: 6px;
		background: rgb(0 0 0 / 65%);
		border-radius: 8px;
		font-size: 0.875rem;
	}
	.watch-navigation a {
		color: white;
	}
	nav[hidden] {
		display: none;
	}
</style>
