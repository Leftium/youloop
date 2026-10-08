# Scroll-Snapping Player Surface

Status: **Draft specification**  
Tracking issue: [#15](https://github.com/Leftium/youloop/issues/15)

## Purpose

YouLoop started as a way to share precisely selected YouTube clips (optionally looped), but its combined editor and playback interface can be confusing for recipients who only want to watch. Make **watching immediate** while preserving powerful playback and A/B editing in the same interface.

A shared link such as [this 24-32 second clip](https://youloop.leftium.com/?v=Dxvrvfyicp0&a=24&b=32) should open into a video-first experience. The viewer can scroll for context or more controls without entering a separate "edit mode."

### Principles

- **One spatial interface, not two products.** Sharing and editing are different entry positions or tasks in one scrollable surface, not separate pages or duplicated primary controls.
- **Video first.** Give the video as much of the effective viewport as the selected surface allows, and keep it visible while the surrounding interface is revealed.
- **Progressive disclosure by scrolling.** Show very little on entry; snap intentionally into meaningful levels rather than arbitrary heights.
- **Discoverability without onboarding.** A partially visible control area at the default snap communicates that more is available below.
- **Preserve clip behavior.** The redesign must not regress URL sharing, A/B range handling, playback, looping, source switching, or YouTube-specific workarounds.

## The vertical snap stack

The list is ordered from the **top of the document downward**. Each level is independently reachable through scrolling and should produce a recognizable resting layout.

| Level | Surface | Revealed information or controls |
| --- | --- | --- |
| **0 Navigation** | Global YouLoop menu / branding / navigation | App-level destinations and actions, independently revealable from Context |
| **1 Context** | Video title, link to original YouTube video, **Change Video** action | Context can be shown without the global menu |
| **2 Immersive** | Video fills the effective viewport | No or nearly no surrounding controls |
| **3 Watch (initial shared-link position)** | Video occupies almost all available space, with a **partial peek** of controls below | A visual hint that scrolling down reveals more |
| **4 Playback** | Video shrinks to reveal the playback surface | Time/progress, play/pause, mute, timeline, loop, speed and seeking |
| **5 Edit** | Video remains visible above the more detailed editing surface | A/B selection, source editor access, copy/share, advanced controls |

The progression is intentionally not a simple accordion: scrolling **up** from Watch reveals Immersive, then Context, then Navigation. Scrolling **down** reveals more playback and editing capabilities. The user can return to viewing by scrolling back upward. Navigation must not always be visible when the user is looking at Context.

The Immersive snap means a player filling the **page's effective viewport**, not necessarily a request to enter the browser Fullscreen API. Existing genuine fullscreen behavior should still work.

### Initial position and entry intent

- A shared clip URL should initially land at **Watch**, not at the document's top (Navigation).
- Watch should show *part* of the lower control region, rather than a fully self-contained toolbar. This "peek" is important to the design.
- Attempt autoplay by default for a shared clip, within browser policy. If sound-on autoplay is denied, use a non-broken fallback (for example muted playback with obvious unmute, or a clear play action).
- Entering YouLoop to author/edit a clip may choose another initial level or restore the last useful position. The exact policy is an **open decision**.
- Snap changes should **not** reload the active video, reset A/B points, or unintentionally interrupt playback.

### Scroll and responsive behavior

- Prefer native scrolling and CSS scroll snapping where feasible; do not hijack wheel or touch behavior merely to simulate a gesture.
- Video dimensions should smoothly respond to how much of the viewport is allocated to exposed content, settling into a few deliberate snap heights.
- Use the **effective visible viewport** on mobile, including browser toolbar and safe-area considerations. Support wide and tall source material without surprising distortion.
- Avoid scroll traps: trackpad, wheel, touch, keyboard scrolling, focus navigation, and motion reduction must remain usable.
- Interactive controls and dialogs must not trigger unexpected snap changes. Focus must remain navigable and visible.
- Exact heights, animation timing, snapping thresholds, and whether the transitions interpolate or jump are to be prototyped and reviewed, not hard-coded in this specification.

## Playback and editing surfaces

Playback progressively reveals core transport functions: play/pause, current time/duration or progress, mute, seek, loop and speed. Edit reveals A/B handles or fields, clip-link copying/sharing, source controls, and advanced options. Actions may appear in multiple appropriate places if that improves discovery, but they should share one source of truth.

An explicit **Edit** affordance may be useful at Watch/Playback. If present, it simply scrolls to the Edit snap; there is no separate editing route to escape into.

Preserve the established semantics of A/B selection and query parameters. A clip URL must remain usable without adding presentation-specific parameters. If a share entry flag or snap-position parameter is added, it should select initial presentation only, not encode a separate player implementation.

## Source dialog

Both **Context** and **Edit** should offer the same **Change Video / Video Source** dialog. This is a shared interaction, not a second standalone form.

Required interactions:

- Enter a YouTube URL or video ID and handle invalid input.
- **Paste from clipboard**, with a manual-input fallback if permission is unavailable.
- **Copy to clipboard** (at least the current source URL; distinguish it from the shareable YouLoop clip URL).
- Open the source on YouTube.
- Apply an edited source or Cancel without changing the active source/clip.
- On close, return to the prior snap level, rather than silently navigating elsewhere.

### Presentation direction

The preferred feel is that opening the source editor **visually shrinks or repositions the video to make room for the dialog's controls**, similar in spirit to the New Evaluation flow in Vee Next. The user should feel they are still working with the video already on screen, rather than jumping to an unrelated editor.

Do **not** require a literal single DOM media element to create that illusion. Keep one primary video/playback experience across snap levels, but a separate temporary YouTube component is acceptable for a candidate preview if needed.

A **live preview is optional and possibly overkill** for the first release. Prefer getting the dialog's layout, clipboard workflow, validation, Apply/Cancel semantics and visual continuity correct first. Preview, if added, must not silently modify the active clip and must handle source restoration on Cancel.

The exact dialog/sheet/modal behavior and source-change rules (for example what to do with the previous A/B selection) remain open decisions.

## Existing behavior to preserve

The current project is a SvelteKit app. Key integration points include:

- [`src/routes/+page.svelte`](https://github.com/Leftium/youloop/blob/main/src/routes/+page.svelte) for the incoming `v`, `a` and `b` query parameters, orientation selection and history updates.
- [`src/lib/player/Player.svelte`](https://github.com/Leftium/youloop/blob/main/src/lib/player/Player.svelte) for the Video.js/YouTube element, media state, looping, sliders and controls.
- [`README.md`](https://github.com/Leftium/youloop/blob/main/README.md) for current playback/crop caveats.

Preserve the recent **fixed `16000px` centered YouTube iframe overscan**, which replaced proportional iframe resizing to reduce resize jitter. Verify resizing at the proposed snap heights and genuine fullscreen. Existing duration settling, bootstrap mute/first-frame recovery and focus-handling behavior should survive the redesign.

Refactoring the combined player/controls component is appropriate, but no particular component split or number of temporary preview elements is mandated here.

## Acceptance criteria for the completed redesign

1. A shared clip opens at the Watch snap with a large video and a partially visible control area; autoplay succeeds when allowed, otherwise the fallback is clear.
2. Users can scroll upward to Immersive, Context and Navigation, and downward to Playback and Edit, with usable snap behavior on mouse, trackpad and touch.
3. Context can be displayed without Navigation. The title and original YouTube link are available there (with a sensible fallback when metadata is unavailable).
4. The primary playing clip remains visually continuous and its playback/clip state is not reset merely by changing snap levels.
5. Playback and Edit affordances remain usable, with existing A/B, loop, seek, mute and rate behavior intact.
6. **Change Video** opens the same source interaction from Context and Edit; clipboard, validation, Apply, Cancel and returning to the previous snap all behave predictably.
7. Shared URLs round-trip video/range state, do not force separate editor/share implementations and remain backwards-compatible.
8. Mobile viewport changes, portrait material, browser fullscreen and keyboard/accessibility paths have explicit coverage; no obvious scroll or focus trap is introduced.

The spec should inform later implementation PRs. The first PR adopting this spec must be **documentation-only**; no redesign code should be bundled into that PR.

## Open questions for design review

- Which actions belong in each level, and precisely how much of the next control tier peeks into Watch?
- Initial entry snap for direct/home visits versus shared URLs; should the chosen snap be represented in the URL?
- When Context has a title unavailable from YouTube metadata, what is the best fallback?
- What should source replacement do with A/B points, loop and paused state? Should it preserve or reset them?
- Should the source interaction be a true modal, a sheet, or a dialog-like reflow that still permits player interaction?
- Is a second-player live preview worth the additional complexity? (Not required for the initial release.)
- How should snap motion and scrolling degrade under `prefers-reduced-motion` and mobile browser chrome changes?

## References

- [Umbrella issue #15](https://github.com/Leftium/youloop/issues/15)
- [Weather Sense](https://ws.leftium.com/) - intentionally partial initial radar view; scrolling up exposes more radar.
- [Zren's Resize YouTube Player To Window Size](https://github.com/Zren/ResizeYoutubePlayerToWindowSize/) - a viewport-filling YouTube player with lower-page content accessible by scrolling.

## Implementation sequencing (non-binding)

After this spec is reviewed, consider separate Continuum PRs for: (1) scroll/snap layout and geometry; (2) control redistribution and shared playback state; (3) source dialog and clipboard flows; (4) shared-link entry state, autoplay and responsive/accessibility verification. Revise boundaries after prototyping. Keep the umbrella issue open until the redesign is delivered.
