<script lang="ts">
	import { videoExamples } from './video-examples';
	let { ready, onchoose }: { ready: boolean; onchoose: (trigger: HTMLButtonElement) => void } =
		$props();
</script>

<section class="welcome" aria-labelledby="welcome-title">
	<header>
		<a class="wordmark" href="/"><img src="/logo.svg" alt="" />YouLoop</a><span
			>A little repetition goes a long way.</span
		>
	</header>
	<div class="intro">
		<div class="pitch">
			<p class="eyebrow">YOUR NEXT BREAKTHROUGH, ON REPEAT</p>
			<h1 id="welcome-title">Find your moment.<br />Make it stick.</h1>
			<p class="promise">Loop, slow down, and focus on any YouTube clip.</p>
			<button disabled={!ready} onclick={(event) => onchoose(event.currentTarget)}
				>Choose video</button
			>
			<p class="hint">Start with a YouTube link, video ID, or shared YouLoop clip.</p>
		</div>
		<figure class="loop-demo">
			<div class="demo-heading">
				<span>Seven seconds. As many tries as you need.</span><span
					class="repeat-mark"
					aria-hidden="true">&#8635;</span
				>
			</div>
			<svg
				viewBox="0 0 320 130"
				role="img"
				aria-label="A seven-second clip loops from Start A at 31 seconds to End B at 38 seconds"
			>
				<path d="M20 65H300" class="track" /><path d="M85 65H235" class="segment" />
				<path d="M235 85 Q235 112 210 112 H110 Q85 112 85 90" class="return" /><path
					d="M78 97L85 87L92 97"
					class="return"
				/>
				<path d="M85 45V85M235 45V85" class="bounds" />
				<text x="85" y="28" text-anchor="middle">A - 0:31</text><text
					x="235"
					y="28"
					text-anchor="middle">B - 0:38</text
				>
				<circle cx="85" cy="65" r="7" class="playhead" />
			</svg>
			<figcaption>
				<span><b>1</b> Choose a video</span><span><b>2</b> Set A and B</span><span
					><b>3</b> Play it again</span
				>
			</figcaption>
		</figure>
	</div>
	<section class="examples" aria-labelledby="examples-title">
		<h2 id="examples-title">Try a little repetition</h2>
		<p>A few clips to get you started.</p>
		<nav aria-label="Video examples" class="cards">
			{#each videoExamples as example (example.label)}<a href={example.href}
					><img
						src={`https://i.ytimg.com/vi/${example.videoId}/hqdefault.jpg`}
						alt=""
						loading="lazy"
					/><strong>{example.description}</strong><span>{example.label}</span></a
				>{/each}
		</nav>
	</section>
</section>

<style>
	.welcome {
		height: 100%;
		overflow-y: auto;
		padding: clamp(20px, 4vw, 56px);
		background:
			radial-gradient(
				ellipse at 75% 15%,
				color-mix(in srgb, var(--nc-primary) 10%, transparent),
				transparent 55%
			),
			var(--nc-surface-1);
	}
	header,
	.intro,
	.examples {
		max-width: 1120px;
		margin-inline: auto;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 48px;
	}
	header > span {
		font-size: 0.85rem;
		opacity: 0.65;
	}
	.wordmark {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font-size: 1.65rem;
		font-weight: 800;
		text-decoration: none;
		color: inherit;
	}
	.wordmark img {
		width: 40px;
		height: 40px;
	}
	.intro {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		align-items: center;
		gap: 48px;
	}
	.eyebrow {
		font-size: 0.7rem;
		letter-spacing: 0.13em;
		font-weight: 700;
		color: var(--nc-primary);
	}
	h1 {
		font-size: clamp(2.3rem, 4.5vw, 4rem);
		line-height: 1.08;
		margin: 16px 0;
		letter-spacing: -0.04em;
	}
	.promise {
		max-width: 34ch;
		font-size: 1.1rem;
	}
	button {
		min-height: 44px;
		margin: 8px 0;
	}
	.hint {
		font-size: 0.8rem;
		opacity: 0.65;
		max-width: 40ch;
	}
	.loop-demo {
		margin: 0;
		padding: 24px;
		border: 1px solid var(--nc-border);
		border-radius: 20px;
		background: var(--nc-surface-2);
		box-shadow: 0 16px 50px rgb(0 0 0 / 6%);
	}
	.demo-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 0.85rem;
	}
	.repeat-mark {
		font-size: 1.8rem;
		color: var(--nc-primary);
	}
	svg {
		width: 100%;
		display: block;
		margin-block: 12px;
		overflow: visible;
	}
	svg text {
		fill: currentColor;
		font-size: 13px;
		font-weight: 600;
	}
	.track {
		stroke: var(--nc-border);
		stroke-width: 8;
		stroke-linecap: round;
	}
	.segment {
		stroke: var(--nc-primary);
		stroke-width: 8;
		stroke-linecap: round;
	}
	.bounds {
		stroke: var(--nc-primary);
		stroke-width: 3;
	}
	.return {
		stroke: var(--nc-primary);
		stroke-width: 2;
		fill: none;
		opacity: 0.6;
	}
	.playhead {
		fill: var(--nc-surface-1);
		stroke: var(--nc-primary);
		stroke-width: 3;
		animation: loop 4s linear infinite;
	}
	@keyframes loop {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(150px);
		}
	}
	figcaption {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 0.7rem;
	}
	figcaption b {
		color: var(--nc-primary);
		margin-right: 4px;
	}
	.examples {
		margin-top: 48px;
	}
	h2 {
		font-size: 1.25rem;
		margin-bottom: 4px;
	}
	.examples > p {
		font-size: 0.85rem;
		opacity: 0.7;
		margin-top: 0;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 14px;
	}
	.cards a {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid var(--nc-border);
		border-radius: 12px;
		background: var(--nc-surface-2);
		color: inherit;
		text-decoration: none;
	}
	.cards a:hover {
		border-color: var(--nc-primary);
	}
	.cards img {
		width: 100%;
		aspect-ratio: 16/9;
		object-fit: cover;
	}
	.cards strong {
		font-size: 0.85rem;
		line-height: 1.4;
		padding: 12px 12px 4px;
	}
	.cards span {
		font-size: 0.7rem;
		opacity: 0.65;
		padding: 0 12px 12px;
	}
	@media (max-width: 760px) {
		header {
			margin-bottom: 28px;
		}
		header > span {
			display: none;
		}
		.intro {
			grid-template-columns: 1fr;
			gap: 24px;
		}
		.loop-demo {
			max-width: 520px;
		}
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.examples {
			margin-top: 32px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.playhead {
			animation: none;
			transform: translateX(75px);
		}
	}
</style>
