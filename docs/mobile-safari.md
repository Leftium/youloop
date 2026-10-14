# Mobile Safari

Use this guide for editor scrolling, known platform limits, and physical-device
checks. Owner observations, hypotheses, and automated evidence are identified
separately; desktop presets do not reproduce Safari toolbar or momentum behavior.

[README](../README.md) | [Development](development.md) | [Player](player.md) | [Mobile Safari](mobile-safari.md) | [Deployment](deployment.md)

## Editor workspace and mobile Safari

See [Player](player.md#editor-workspace-and-mobile-safari) for the editor workspace
contract. The layout details below explain its mobile scrolling behavior.

On small touch viewports, video swipes use native document scrolling with 20px
snapping automatically. Controls retain independent scrolling. Desktop uses the
bounded workspace. Reset split restores layout ratios and the automatic layout
choice; it does not disable mobile scrolling. No experiment switches or hints are
shown, and scrolling behavior adds no URL or session parameters.

With video scrolling active, the complete grid is sticky over a native document
runway. Controls retain their own `overflow-y: auto` scroller, with
`overscroll-behavior-y: none` to suppress boundary chaining/bouncing where supported.
Only the document scrollbar indicator is hidden; the controls scrollbar remains.
The document, preview and controls all use Nimble's `--nc-surface-1`, avoiding a
contrasting strip during Safari toolbar transitions. A one-pixel, noninteractive
Nimble border follows the visible portrait viewport edge to separate controls
from chrome even when expanded bars cover the `lvh` pane bottom.
On mobile the controls content
has a minimum height one pixel greater than its available area, giving even short
content a native scroll range. The owner confirmed this restores independent
scrolling for controls whose real content fits without scrolling. It adds no touch cancellation or root-scroll lock.
The mobile grid uses `100lvh` to limit resizing during toolbar animation.
Expanded Safari bars can cover its bottom edge; the owner accepted this landscape
tradeoff. The bounded editor uses `100dvh`. In portrait, settings add a scrollable
`100lvh - 100svh` bottom reserve plus normal safe-area padding. The owner confirmed
that this lets the final controls scroll above expanded chrome.

The runway starts at 25 small viewports and freezes its height in pixels. Passive
scroll/resize listeners add 25 current viewports before fewer than nine remain.
Rotation never shrinks the runway. Snapping uses invisible 20px-spaced document
points with `scroll-snap-stop: always`; points extend with the runway. Controls
have no snap rules. There is no programmatic scrolling, synthetic gesture, global
touch interception, or momentum lock. Splitters own their resize gestures with
pointer capture and `touch-action: none`; splitter-triggered chrome collapse is
not implemented. The temporary scroll-offset overlay was removed after testing.

### Remaining physical iPhone Safari checks

Use a normal Safari tab, record phone/iOS version, address-bar position, orientation,
and starting toolbar state. Chromium verifies geometry and provider identity,
not actual Safari toolbar collapse, momentum handoff, or native resize animation.

1. Reload `/?v=dt-SqNL4z3w&t=5-50&mute`; confirm controls contain no experiment
   switches or explanatory hint. Video swipes should scroll the document; the
   controls scrollbar should belong only to its pane.
2. Compare strong/weak and slow/fast video swipes, including similar travel at
   different speeds. Check partial/full collapse, reverse gestures, and the
   immediate/wait/separate-tap controls handoff.
3. Repeat both splitter directions in portrait and landscape, both layouts, with
   bars expanded and minimized. Keep preview, timeline, and all actions reachable;
   watch for viewport jitter and unwanted page movement.
4. Keep playing the muted clip while scrolling controls at both boundaries,
   extending the runway repeatedly, resizing, switching layouts, changing Fit/Fill,
   and rotating. Repeat while paused; swipes must not toggle playback or reload
   the provider. Inspect root `scrollY` and pane `scrollTop` remotely if needed.
5. Check bottom spacing, safe areas, Safari's address-bar keyboard opening/closing,
   external-keyboard focus, and all settings' reachability. Reset restores layout defaults while native mobile scrolling
   remains active; reload preserves the chosen mobile behavior without adding URL
   or session parameters. Compare editor/watch Back/Forward and the
   unchanged video-first `/dt-SqNL4z3w/5~50?mute`.

The remaining portrait gap above the floating toolbar is accepted to preserve
independent controls scrolling. Diagnostics measured grid/pane bottom at 704px
while the visible viewport grew from 664px to 704px after collapse. Neither editor
viewport cover, a 60px pane extension, disabling controls overflow, nor moving
stickiness to an outer shell removed the visible cutoff. Ordinary document flow
painted behind the toolbar but scrolled the video away and sacrificed independent
controls scrolling. These findings identify a rendering difference; they do not
prove its internal WebKit cause. The failed variants, geometry readout, and debug
switches were removed. Further investigation should use a minimal Safari
reproduction rather than adding scroll-following workarounds to the editor.
The bottom divider can flash briefly when chrome expansion/contraction coincides
with rubber-band bounce. The owner considers that residual behavior acceptable.

**Remaining device verification:** detailed safe-area/keyboard coverage, viewport
resize smoothness, and broader iOS versions remain manual. The owner confirmed the
observations recorded below; a completely uncoupled first gesture is not claimed.

## Historical owner observations

These findings were carried over from the editor scroll investigation. The iOS
version was not recorded; they are device observations, not a universal Safari
guarantee or a new verification run.

### Owner-reported physical Safari results

These observations came from the owner's iPhone Safari testing. The iOS version
was not recorded; timings and offsets are approximate. Later portrait diagnostics
reported a screen height of 812 CSS pixels and viewport heights of 664/704 pixels
before/after toolbar collapse.

| Comparison                                                        | Observed result                                                                                                                                             |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded editor                                                    | Chrome did not shrink.                                                                                                                                      |
| First native-page variant                                         | Video and controls shared a document scrollbar; chrome reacted in both directions. Rejected.                                                                |
| Sticky whole workspace with nested controls                       | Video scrolling could minimize chrome. Runway extension worked and landscape regions grew to fill newly freed height.                                       |
| Immediate controls drag after a video flick                       | First gesture could remain coupled to the document until finger release; the controls scrollbar did not appear.                                             |
| Wait for coasting to stop, or stop it with a separate tap/release | Controls scrolled independently. This supports a momentum/latching hypothesis without proving its mechanism.                                                |
| Fixed workspace instead of sticky                                 | Coupling persisted. Rejected.                                                                                                                               |
| Brief root overflow lock after video swipe                        | Coupling persisted with the trial on or off. Rejected and removed.                                                                                          |
| No snapping vs 160px snapping                                     | Document offset kept changing for about 3 seconds without snapping, versus about 1 second or less with snapping. Coupling followed the moving offset.       |
| 80px and 40px snapping                                            | Further improvement at 80px; 40px increments worked.                                                                                                        |
| 20px snapping                                                     | Worked; stronger swipes could cross multiple points. Selected for the final candidate.                                                                      |
| 10px snapping                                                     | Worked inconsistently; returned to 20px.                                                                                                                    |
| Slow video drag                                                   | Chrome animated toward collapse around 30-40px of travel and could settle partially collapsed around 30px. A strict velocity threshold was not established. |

Snapping mitigates coasting and the coupling window; it does not guarantee gesture
handoff or full toolbar collapse. Safari owns snap physics and toolbar visibility.
A small/slow gesture can leave bars partially collapsed, and reverse scrolling or
snapping backward may reveal them. Waiting for document momentum to stop or using
a separate tap/release remains the confirmed workaround. More snap points also
add DOM elements as the runway grows; 20px is a device-tested compromise, not a
universal optimum.

## Watch viewport correction and device verification

The following notes came from the investigation of the PR #18 watch route.
Recorded confirmations apply to the tested source and device configuration.
The checklists remain useful when changing viewport or watch behavior; the old
blocking rechecks are not standing merge requirements for unrelated PRs.

### Physical iPhone viewport correction

Physical tests localized landscape picture clipping to the watch route introduced
in `af18e43` (PR #18). The original `/` player was unclipped at both `700561c`
and `af18e43`, while `/s` at `af18e43` clipped the left edge. On that same
watch page, removing only `viewport-fit=cover` eliminated the clipping; the owner
confirmed this with a landscape screenshot. Removing the iframe translation
had not fixed it. DOM canvas/frame centers could agree even while the visible
provider picture was clipped, so headless geometry tests alone missed this.

The shared layout declares one `width=device-width, initial-scale=1` viewport
for both routes. It preserves the editor's viewport, native zoom,
`100lvh` watch stage, explicit canvas centering, 16000px iframe crop and existing
visible-viewport intersection. No touch cancellation or horizontal clipping is
added. The viewport regression guards this exact declaration. Temporary
isolation switches, geometry logging and historical-build middleware have been
removed; locally generated investigation artifacts remain ignored.

The latest normal-view iPhone tests did not reproduce horizontal panning,
including rotation, playback, timeline switching and Default/Theater travel.
Its original cause is not established, so describe this as a passing retest
rather than attributing a separate panning fix to the viewport change. Earlier
Android Firefox/Chrome tests also did not reproduce panning.

### Watch device verification checklist

The owner also confirmed the restored current implementation with full controls
in landscape: picture/timeline aligned, no left clipping and no sideways
dragging. This verifies the tested landscape source and device configuration.
When changing watch viewport behavior, extend the physical iPhone Safari check to: landscape and portrait
sources in both phone orientations, reload and source detection, browser chrome
expanded/collapsed, picture/timeline alignment, and independent horizontal swipe
attempts. Record the final tested SHA. The complete device matrix, accessibility
and available fullscreen still require verification; headless WebKit does not
replace those checks.

The source-geometry regression mounts the actual watch Player and orientation
controller, delays landscape-to-portrait detection until after first paint, and
checks both-axis centering, provider iframe bounds/identity, visible overlay and
3px timeline geometry, and document overflow. Run it at both phone viewport
orientations. It measures the iframe, not YouTube's cross-origin internal video
pixels; compare the visible picture separately on device.

For a Safari recheck, use the candidate PR head and record the iOS/Safari
version, URL, orientation, browser toolbar state, and zoom scale. Swipe left and
right over the black background as well as the video, before/after rotating,
after vertical Default/Theater travel, and after reloading in each orientation.
At initial scale 1, the document must have no horizontal scroll range or lateral
movement. Check that title, controls and timeline overlay the same centered
canvas, rather than a shifted sliver. Repeat with expanded/collapsed toolbars.
Use both landscape-format and portrait-format source videos in both phone
orientations. Reload directly in landscape and record initial paint, pending
orientation detection, and settled geometry; repeat after rotation. Compare the
actual picture with the canvas and provider frame rather than assuming which
width is right. Keep the panning and alignment outcomes separate.
A deliberate pinch zoom is a separate case; do not disable it to obtain a pass.

Capture geometry in Safari's remote Web Inspector before and after each case:

```js
function watchGeometry() {
	const root = document.scrollingElement;
	const viewport = window.visualViewport;
	const media = document.querySelector('youtube-video');
	return {
		scrollX,
		scrollY,
		innerWidth,
		innerHeight,
		root: {
			scrollWidth: root.scrollWidth,
			clientWidth: root.clientWidth,
			scrollLeft: root.scrollLeft
		},
		viewport: {
			width: viewport.width,
			height: viewport.height,
			offsetTop: viewport.offsetTop,
			offsetLeft: viewport.offsetLeft,
			pageLeft: viewport.pageLeft,
			scale: viewport.scale
		},
		bounds: Object.fromEntries(
			[
				'.share-prototype',
				'.stage',
				'.player',
				'.media-canvas',
				'.watch-overlay',
				'.watch-timeline',
				'youtube-video'
			].map((s) => [s, document.querySelector(s)?.getBoundingClientRect().toJSON()])
		),
		iframe: media.shadowRoot?.querySelector('iframe')?.getBoundingClientRect().toJSON()
	};
}
console.log(JSON.stringify(watchGeometry()));
```

On the Vite preview, the same measurements are available from
`(await import('/src/lib/player/watch-viewport.browser-test.ts')).snapshot()`.
The checked regression attempts horizontal document scrolling and verifies
visible-canvas intersection, media identity, native vertical scrolling and zero
horizontal overflow. Run it again after viewport rotation and reload. Injected
visual-viewport offsets and desktop device presets do not reproduce Safari's
physical browser chrome or establish the device fix.

When changing watch controls or viewport behavior, verify on a physical iPhone with Safari:

- Compare tapping Theater with a manual downward swipe from expanded browser
  chrome. Record whether each collapses the toolbar; they may differ.
- Check the timeline above expanded and collapsed chrome, in portrait and
  landscape, during playback and rotation. Watch for reframing, jitter, or black
  flashes, and check that up-scrolling returns to Default after runway growth.
- Check background taps before and after auto-hide, paused and playing;
  each tap must toggle playback in Default and Theater, including over the
  center indicator. Swipes, drags, wheel activity, and mute must not toggle
  playback. Check keyboard/assistive activation in Theater and title selection. Verify usable hit targets and
  safe-area placement on short landscape screens.
- Switch the time display by touch and keyboard. Check both progress scales,
  time labels, tails, and narrow-screen layout; switching must preserve playback
  and the video frame. After controls fade in Theater, scroll up and confirm
  they visibly reappear without a mouse movement.
- Exercise native fullscreen where the browser offers it, then exit and confirm
  the prior logical mode and uninterrupted playback state.

Also check desktop fullscreen/hover/keyboard navigation and a physical Android
browser when available. Chromium viewport presets and injected touch events do
not establish physical-device behavior.
