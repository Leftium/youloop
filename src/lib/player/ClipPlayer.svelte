<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { pushState, replaceState } from '$app/navigation';
	import Player from './Player.svelte';
	import VideoPicker from './VideoPicker.svelte';
	import Welcome from './Welcome.svelte';
	import type { EditorSource } from './editor-source';
	import { createOrientationController, type Orientation } from './youtube-orientation';
	import {
		parsePlayerUrl,
		formatShareBounds,
		type TimestampPolicy,
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

	function emptyRoot(url: URL) {
		return url.pathname === '/' && !['v', 't', 'a', 'b'].some((key) => url.searchParams.has(key));
	}
	let picker = $state<VideoPicker>(undefined!);
	const initial = untrack(() => parsePlayerUrl(new URL(page.url.href)));
	const initialClip = initial.ok ? initial.value : { videoId: 'dt-SqNL4z3w' };

	let youtubeId = $state(initialClip.videoId);
	let startExpression = $state(initialClip.start);
	let endExpression = $state(initialClip.end);
	let generatedStart = $state(false);
	let generatedEnd = $state(false);
	let generatedBounds = $derived({ start: generatedStart, end: generatedEnd });
	let clipInvalid = $state(false);
	let requestedBounds = $derived({ start: startExpression, end: endExpression });
	let repeatA = $state(Math.max(0, initialClip.start ?? 0));
	let repeatB = $state(
		initialClip.end !== undefined && initialClip.end > 0 ? initialClip.end : 99999
	);
	let once = $state(initialClip.once ?? false);
	let mute = $state<boolean | undefined>(initialClip.mute);
	let speed = $state<number | undefined>(initialClip.speed);
	let vertical = $state<boolean | undefined>(initialClip.vertical);
	let mirror = $state(initialClip.mirror ?? false);
	let fill = $state<boolean | undefined>(initialClip.fill);
	let orientation = $state<Orientation>('landscape');
	let sourceOrientation = $state<Orientation>('landscape');
	let sourceAspectRatio = $state(16 / 9);
	let fillFrame = $derived(fill ?? orientation !== sourceOrientation);
	let ready = $state(false);
	let loaded = $state(initial.ok && !untrack(() => emptyRoot(new URL(page.url.href))));
	let error = $state(
		initial.ok ? '' : `Invalid link: ${initial.errors.map((item) => item.parameter).join(', ')}`
	);
	let settledDuration = $state<number>();
	let timestampPolicy = $state<TimestampPolicy>('preserve');
	let controller: ReturnType<typeof createOrientationController>;
	let loadedHref = '';
	let bareDemo = false;
	let demoState = '';

	let clip = $derived<ShareUrlState>({
		videoId: youtubeId,
		start: startExpression,
		end: endExpression,
		once,
		mute,
		speed,
		vertical,
		fill,
		mirror
	});
	let normalized = $derived(normalizeShareUrl(clip));
	let formatted = $derived(
		minimal ? clip : formatShareBounds(clip, settledDuration, timestampPolicy, generatedBounds)
	);
	let sharePath = $derived(
		normalized.ok && !clipInvalid && formatted ? serializeShareUrl(formatted) : undefined
	);
	// Keep invalid clips repairable and their history identity intact.
	let editorPath = $derived(normalized.ok ? serializeEditorUrl(formatted ?? clip) : undefined);
	let shareUrl = $derived(sharePath ? new URL(sharePath, page.url.origin).href : undefined);

	const timestampPolicies: { value: TimestampPolicy; label: string }[] = [
		{ value: 'preserve', label: 'As entered' },
		{ value: 'shortest', label: 'Shortest' },
		{ value: 'from-start', label: 'Both from start' },
		{ value: 'mixed', label: 'Start + end' },
		{ value: 'from-end', label: 'Both from end' }
	];
	let timestampOptions = $derived(
		timestampPolicies.map((option) => {
			const formatted = formatShareBounds(clip, settledDuration, option.value, generatedBounds);
			return {
				...option,
				preview: formatted && !clipInvalid ? serializeShareUrl(formatted) : undefined
			};
		})
	);

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
		bareDemo = url.pathname === '/s' && !url.searchParams.has('v');
		const result = parsePlayerUrl(url);
		if (!result.ok) {
			error = `Invalid link: ${result.errors.map((item) => item.parameter).join(', ')}`;
			loaded = false;
			return;
		}
		if (emptyRoot(url)) {
			error = '';
			loaded = false;
			return;
		}
		const value = result.value;
		error = '';
		timestampPolicy = 'preserve';
		youtubeId = value.videoId;
		startExpression = value.start;
		endExpression = value.end;
		generatedStart = false;
		generatedEnd = false;
		clipInvalid = false;
		repeatA = Math.max(0, value.start ?? 0);
		repeatB = value.end !== undefined && value.end > 0 ? value.end : 99999;
		once = value.once ?? false;
		mute = value.mute;
		speed = value.speed;
		vertical = value.vertical;
		fill = value.fill;
		mirror = value.mirror ?? false;
		controller.setSource(
			youtubeId,
			vertical === undefined ? null : vertical ? 'portrait' : 'landscape'
		);
		demoState = serializeShareUrl(value);
		loaded = !emptyRoot(url);
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
			const next = new URL(path, window.location.href);
			if (next.href === loadedHref) return;
			bareDemo = false;
			loadedHref = next.href;
			// Retain SvelteKit's history bookkeeping; edits replace rather than spam Back.
			replaceState(next, page.state);
		});
	});

	function applySource({ videoId, clip: imported }: EditorSource) {
		const wasEmpty = !loaded;
		if (!imported || videoId !== youtubeId) settledDuration = undefined;
		youtubeId = videoId;
		timestampPolicy = 'preserve';
		startExpression = imported?.start;
		endExpression = imported?.end;
		generatedStart = false;
		generatedEnd = false;
		repeatA = Math.max(0, imported?.start ?? 0);
		repeatB = imported?.end !== undefined && imported.end > 0 ? imported.end : 99999;
		if (imported) {
			once = imported.once ?? false;
			mute = imported.mute;
		}
		clipInvalid = false;
		vertical = imported?.vertical;
		fill = imported?.fill;
		mirror = imported?.mirror ?? false;
		speed = imported?.speed;
		controller.setSource(
			videoId,
			vertical === undefined ? null : vertical ? 'portrait' : 'landscape'
		);

		loaded = true;
		if (wasEmpty) {
			const next = new URL(serializeEditorUrl(imported ?? { videoId }), page.url.origin);
			loadedHref = next.href;
			pushState(next, page.state);
		}
		bareDemo = false;
		error = '';
	}
</script>

{#if error}
	<p role="alert">{error}</p>
	<button disabled={!ready} onclick={(event) => picker.open(event.currentTarget)}
		>Choose video</button
	>
{:else}
	<!-- One shared state owner; presentation changes never duplicate the media engine. -->
	{#if loaded}
		<Player
			bind:youtubeId
			bind:repeatA
			bind:repeatB
			{requestedBounds}
			{timestampPolicy}
			{timestampOptions}
			onpolicychange={(value) => (timestampPolicy = value)}
			ondurationresolved={(value) => (settledDuration = value)}
			onboundsresolved={(valid) => (clipInvalid = !valid)}
			onstartchange={(value, generated = false) => {
				startExpression = value;
				generatedStart = generated;
			}}
			{once}
			{mute}
			{speed}
			{orientation}
			{vertical}
			{fill}
			{mirror}
			{fillFrame}
			{sourceAspectRatio}
			{minimal}
			{editorPath}
			{theater}
			{ontheater}
			ononcechange={(value) => (once = value)}
			onmutechange={(value) => (mute = value)}
			onspeedchange={(value) => (speed = value)}
			onendchange={(value, generated = false) => {
				endExpression = value;
				generatedEnd = generated;
			}}
			onmirrorchange={(value) => (mirror = value)}
			onfillchange={(value) => (fill = value)}
			onorientationchange={(value) => {
				vertical = value === undefined ? undefined : value === 'portrait';
				if (value === undefined) controller.clearOverride();
				else controller.choose(value);
			}}
			onsourcechange={(videoId, clip) => applySource({ videoId, clip })}
		>
			{#snippet editorFooter(available: boolean)}
				<div class="share-row">
					<span class="share-label">Share URL</span>
					{#if available && shareUrl}
						<a class="share-link" href={shareUrl} title={shareUrl} aria-label="Share URL"
							><bdi dir="ltr">{shareUrl}</bdi></a
						>
					{:else}
						<span class="share-unavailable" role="status">Unavailable</span>
					{/if}
				</div>
			{/snippet}
			{#snippet editorFeedback()}
				{#if !normalized.ok && !clipInvalid}
					<p role="alert">Choose an end after the start to share this clip.</p>
				{/if}
			{/snippet}
		</Player>
	{:else}
		<Welcome {ready} onchoose={(trigger) => picker.open(trigger)} />
	{/if}
	{#if minimal && !normalized.ok}
		<p role="alert">Choose an end after the start to share this clip.</p>
	{/if}
{/if}

{#if !loaded || error}<VideoPicker bind:this={picker} onapply={applySource} />{/if}

<style>
	.share-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-width: 0;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.share-label {
		flex-shrink: 0;
		color: var(--nc-secondary);
	}
	.share-link {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		/* Clip the beginning, while the isolated LTR text preserves URL punctuation. */
		direction: rtl;
		font-variant-numeric: tabular-nums;
		line-height: 2rem;
	}
	.share-link:focus-visible {
		outline: 2px solid var(--nc-primary);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.share-unavailable {
		color: var(--nc-secondary);
	}
	button {
		min-height: 44px;
		margin: 0;
	}
</style>
