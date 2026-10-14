# Browser test profiling - PR #59

Measured locally on 2026-10-14, using one worker and the same installed Chromium/WebKit binaries. The baseline is the untouched PR head `9b47d65`; product code did not change. JSON reports supplied durations, outcomes and retries. These are local samples, not a reliability guarantee.

## Before and after

| Run                                       | Executions | Pass / skip / fail | Retries | Wall time |
| ----------------------------------------- | ---------: | ------------------ | ------: | --------: |
| Untouched baseline                        |        164 | 154 / 9 / 1        |       0 |    561.6s |
| First offline attempt (thumbnail failure) |         36 | 35 / 0 / 1         |       0 |     72.9s |
| Revised routine                           |         36 | 36 / 0 / 0         |       0 |     57.0s |
| Routine repeat                            |         36 | 36 / 0 / 0         |       0 |     56.3s |

| Browser  | Baseline count | Routine count | Baseline case sum / block | Routine case sum / block |
| -------- | -------------: | ------------: | ------------------------: | -----------------------: |
| chromium |             95 |            28 |           400.3s / 402.4s |            46.9s / 47.3s |
| webkit   |             69 |             8 |           158.1s / 158.5s |              7.4s / 7.5s |

Wall time fell by 89.8%. WebKit fell from 69 configured executions (nine known CDP skips) to eight actual passes: 151.0s less browser-block time (95.2%). WebKit's original block was 28.2% of baseline wall time. A block spans that project's first test start through last test end; it includes inter-case runner overhead, but excludes server startup. Case sums are not wall times. Wall time outside those browser blocks was 0.7s in the warmed baseline and 2.2s in the fresh routine run, including startup and runner transitions.

The baseline reused the existing warmed development server; routine starts its own offline server on port 5174. Routine wall time includes that startup. The comparisons include different provider dependency and selection, not merely browser speed. No parallelism experiment, default retries, new skips or timeout increases were used.

Routine metrics: 36 attachments, 232 external browser requests, all intercepted; 52 responses, all locally fulfilled iframe documents. There were 52 intercepted embed requests and four blocked server fetch attempts. No external route continued. Iframe requests and mock clock starts are not decoded YouTube frames or live playback starts.

## Hotspots and decisions

- **NSGIZ crop readiness:** unchanged Chromium failed after 60.1s at the positive media/engine duration predicate. Its trace showed navigation in 26.6ms, successful iframe/thumbnail responses in roughly 0.2-0.3s, and 59.7s inside the readiness wait. The page still displayed an unknown duration. This identifies the stalled predicate, not the underlying provider/adapter cause; Chromium failed while WebKit passed in this baseline. The provider crop probe is advisory, with its assertions intact.
- **Landscape preset:** both baseline browsers passed this time. Its 30s `duration > 10` wait was unrelated to the picker URL/selection contract and is deleted for all five presets. Routine uses the API fixture; live crop pixels and real durations are no longer required by those picker tests.
- **Watch gestures/Theater (19.7s):** console-invoked native/provider interactions need live playback and have broad diagnostic scope. Downgraded to advisory.
- **Native document-scroll journeys (10.9s/10.3s):** many injected swipe sequences, explicit 30/50/300/400ms sleeps, playback waits, viewport transitions and reloads. Advisory; routine keeps independent settings scroll and responsive geometry, but does not reproduce momentum, runway growth or document swipe ownership.
- **Precision/policy matrices (Chromium 8.4s, WebKit 10.2s; WebKit URL policies 8.0s):** repeated dialog actions, six policy iterations, navigation/reload and provider startup. Advisory. Existing Node URL contracts plus one imported precision journey stay required; exhaustive DOM policy wiring can regress without a gate failure.
- **Watch Loop/Once proofs (11.8s/10.9s):** already mocked, with real-time advancement and multiple boundaries. Retained; source-end seeks now start one second before the boundary instead of four, and full-video scope starts beyond clip B before proving advancement. The same crossing/state assertions remain.
- **Offline clipboard preview:** first attempt failed because the fixture aborted its external thumbnail and the product correctly switched to unavailable preview. The test response now references local `logo.svg`; the selected-title and deferred-commit assertions remain.

SSR metadata can consume its configured two-second deadline on each uncached source/navigation. Baseline timings include SSR and provider startup, but we did not instrument every successful case to assign exact fractions to each. The failed NSGIZ trace supports the readiness attribution above; other causes are source-level explanations, not measured timing decompositions. Offline SSR uses the existing metadata fallback instead of external fetches.

Focused repeat: the unchanged Chromium NSGIZ crop probe was failed in 60.1s (60.8s wall), with no retry. This isolated result does not replace the baseline's failure or establish that the expanded advisory suite is green.

## Required coverage and accepted gaps

Required Chromium: picker initial focus/history at desktop/mobile widths, all five preset commits, short-dialog scroll containment, Escape/composition, padded close touch target, clipboard preview, landing navigation; splitter pointer/keyboard, resize-before-frame behavior, responsive geometry/scroll and playback identity; imported precision/reload/edit, active-playback range-modal focus; pinned share-footer geometry; invalid routes and editor aliases/share/history; signed bounds/history, signed Loop/Once and repair under two flag sets; legacy `/s` Loop and canonical Once at clip/source ends.

Required WebKit: the two initial picker widths, short-dialog scroll containment, Escape/composition, padded close touch target, viewport resize during playback, mobile responsive geometry/scroll, and the mocked playback/provider identity journey. Eight executions, selected individually rather than whole-file duplication. WebKit does not repeat every Chromium URL or precision assertion.

All 128 omitted baseline executions are listed as advisory in the baseline ranking below, including the nine pre-existing WebKit skips. They remain runnable on demand; they are removed from the required gate rather than claimed as covered elsewhere. Detailed cosmetic/transport/tooltip matrices, source-title freshness, source replacement, mirror/crop-source detection, live seeks/buffering, provider focus/decoded pixels, native swipe/runway and toolbar simulations can regress without routine failure. Physical Safari toolbar/momentum/fullscreen remain manual. Product code and Node tests are unchanged.

CI now runs the complete **routine selection**, including the four existing offline API proofs. Hosting/social production smokes remain required. `test:browser:advisory` selects broader live coverage; no green expanded run is claimed after pruning. The obsolete extended/provider/UI commands are removed.

## Local verification

`pnpm check` (zero errors/warnings), `pnpm lint`, all 58 Node tests, the proof-enabled production build, seven hosting smokes and nine social smokes passed. Both final routine runs include the four offline Video.js API proofs. CI and preview deployment are recorded in the PR after push.

## File totals

| Browser / file                          | Baseline executions / sum | Routine executions / sum |
| --------------------------------------- | ------------------------: | -----------------------: |
| chromium / editor-polish.spec.ts        |                14 / 52.7s |                 2 / 5.8s |
| chromium / editor-workspace.spec.ts     |                24 / 88.1s |                 4 / 6.1s |
| chromium / framing.spec.ts              |                 9 / 83.5s |                 0 / 0.0s |
| chromium / share-footer.spec.ts         |                 7 / 12.7s |                 1 / 1.5s |
| chromium / share-routes.spec.ts         |                14 / 77.1s |                 2 / 3.7s |
| chromium / signed-ranges.spec.ts        |                 8 / 34.6s |                5 / 10.2s |
| chromium / video-picker.spec.ts         |                15 / 15.4s |                12 / 7.2s |
| chromium / watch-playback-scope.spec.ts |                 4 / 36.2s |                2 / 12.4s |
| webkit / editor-polish.spec.ts          |                14 / 59.3s |                 0 / 0.0s |
| webkit / editor-workspace.spec.ts       |                24 / 41.7s |                 3 / 4.7s |
| webkit / framing.spec.ts                |                 9 / 25.4s |                 0 / 0.0s |
| webkit / share-footer.spec.ts           |                 7 / 14.9s |                 0 / 0.0s |
| webkit / video-picker.spec.ts           |                15 / 16.7s |                 5 / 2.7s |

## Baseline individual duration ranking

Each row is one browser execution, ordered by duration within its browser. Scenario paths distinguish viewport/flag matrices. Status is the actual run result; retries are shown explicitly.

| Browser  | Seconds | Status | Retries | File / scenario                                                                                                                                                     | Gate disposition |
| -------- | ------: | ------ | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| chromium |   60.10 | fail   |       0 | framing.spec.ts / mirror preserves crop fixture NSGIZbUbIWw                                                                                                         | advisory         |
| chromium |   19.72 | pass   |       0 | share-routes.spec.ts / canonical watch gestures, mute/unmute, Theater and viewport regressions                                                                      | advisory         |
| chromium |   11.81 | pass   |       0 | watch-playback-scope.spec.ts / selected scope obeys Loop with legacy routing at clip and video end                                                                  | routine          |
| chromium |   11.75 | pass   |       0 | share-routes.spec.ts / Edit link preserves playback, provider identity, new tab and Back/Forward                                                                    | advisory         |
| chromium |   10.90 | pass   |       0 | editor-workspace.spec.ts / automatic mobile document scrolling / 390x844 / video scrolls the document while settings, splitter and live provider stay independent   | advisory         |
| chromium |   10.87 | pass   |       0 | watch-playback-scope.spec.ts / selected scope obeys Once at clip and video end                                                                                      | routine          |
| chromium |   10.32 | pass   |       0 | editor-workspace.spec.ts / automatic mobile document scrolling / 844x390 / video scrolls the document while settings, splitter and live provider stay independent   | advisory         |
| chromium |    9.05 | pass   |       0 | framing.spec.ts / mirror watch/editor reload, history, false flags and source imports                                                                               | advisory         |
| chromium |    8.42 | pass   |       0 | editor-polish.spec.ts / editor polish / generated precision agrees across policies, actual links, history and playback state                                        | advisory         |
| chromium |    8.17 | pass   |       0 | share-routes.spec.ts / editor aliases, live state, canonical sharing, reload and Back/Forward                                                                       | routine          |
| chromium |    7.85 | pass   |       0 | signed-ranges.spec.ts / invalid resolved and collapsed clips pause without rewriting their identity                                                                 | advisory         |
| chromium |    7.34 | pass   |       0 | editor-polish.spec.ts / editor polish / imported high precision and signed intent survive viewing, reload and generated edits                                       | routine          |
| chromium |    6.79 | pass   |       0 | watch-playback-scope.spec.ts / canonical scope switches preserve playback, URL and provider                                                                         | advisory         |
| chromium |    6.78 | pass   |       0 | share-routes.spec.ts / new editor parameters win over aliases, seek/step/loop/once work with real YouTube                                                           | advisory         |
| chromium |    6.77 | pass   |       0 | watch-playback-scope.spec.ts / long, open-ended and complete clips select the right default, including source navigation                                            | advisory         |
| chromium |    6.57 | pass   |       0 | editor-polish.spec.ts / editor polish / late metadata refreshes a read-only long title without requests or remounts                                                 | advisory         |
| chromium |    6.48 | pass   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 844x390 / settings scroll independently; picture swipes scroll the document without changing playback at 844x390 | advisory         |
| chromium |    5.69 | pass   |       0 | signed-ranges.spec.ts / signed fractions survive watch/editor/copy/reload/history and explicit bound edits                                                          | routine          |
| chromium |    5.66 | pass   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 390x844 / settings scroll independently; picture swipes scroll the document without changing playback at 390x844 | advisory         |
| chromium |    5.48 | pass   |       0 | share-routes.spec.ts / source changes and out-of-duration validation retain editor parity                                                                           | advisory         |
| chromium |    5.32 | pass   |       0 | signed-ranges.spec.ts / invalid watch clips retain Edit and can be repaired: mute                                                                                   | routine          |
| chromium |    4.96 | pass   |       0 | editor-polish.spec.ts / editor polish / all live URL policies agree with the share link, preserve bounds and provider                                               | advisory         |
| chromium |    4.80 | pass   |       0 | share-routes.spec.ts / existing editor geometry, orientation, provider focus and timeline suites                                                                    | advisory         |
| chromium |    4.31 | pass   |       0 | signed-ranges.spec.ts / invalid watch clips retain Edit and can be repaired: once&mute&speed=1.5&vertical=0&fill=0                                                  | routine          |
| chromium |    4.30 | pass   |       0 | editor-workspace.spec.ts / compact bounds retain signed fractions and refresh after source navigation                                                               | advisory         |
| chromium |    4.25 | pass   |       0 | editor-workspace.spec.ts / preview transport, branding and grouped layout fill desktop and mobile viewports                                                         | advisory         |
| chromium |    4.24 | pass   |       0 | editor-polish.spec.ts / editor polish / original YouTube source link keeps its displayed time and destination in sync                                               | advisory         |
| chromium |    4.17 | pass   |       0 | editor-polish.spec.ts / editor polish / dialog source drafts, supported links, clipboard previews and title freshness                                               | advisory         |
| chromium |    4.09 | pass   |       0 | editor-workspace.spec.ts / short controls 844x390 / fitting controls retain gesture ownership and provider identity                                                 | advisory         |
| chromium |    4.00 | pass   |       0 | editor-workspace.spec.ts / short controls 390x844 / fitting controls retain gesture ownership and provider identity                                                 | advisory         |
| chromium |    3.94 | pass   |       0 | signed-ranges.spec.ts / signed range obeys Loop at resolved B                                                                                                       | routine          |
| chromium |    3.94 | pass   |       0 | share-routes.spec.ts / watch Fit/Fill and source geometry at 390x844                                                                                                | advisory         |
| chromium |    3.90 | pass   |       0 | video-picker.spec.ts / candidate metadata is debounced, stale-safe, optional, and never commits playback                                                            | advisory         |
| chromium |    3.82 | pass   |       0 | signed-ranges.spec.ts / signed range obeys Once at resolved B                                                                                                       | routine          |
| chromium |    3.71 | pass   |       0 | share-routes.spec.ts / open end survives duration settlement and reload: /dt-SqNL4z3w/31?fill=0                                                                     | advisory         |
| chromium |    3.71 | pass   |       0 | share-routes.spec.ts / watch Fit/Fill and source geometry at 844x390                                                                                                | advisory         |
| chromium |    3.20 | pass   |       0 | share-routes.spec.ts / open end survives duration settlement and reload: /s?v=dt-SqNL4z3w&a=31&b=99999&fit=contain                                                  | advisory         |
| chromium |    3.13 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 1280px                                                                                        | advisory         |
| chromium |    3.05 | pass   |       0 | editor-workspace.spec.ts / session preferences restore, reconcile on resize, reset and stay out of share URLs                                                       | advisory         |
| chromium |    2.94 | pass   |       0 | editor-workspace.spec.ts / upper-right tooltips fit inside the preview at narrow and wide sizes                                                                     | advisory         |
| chromium |    2.86 | pass   |       0 | editor-workspace.spec.ts / pointer and keyboard splitter bounds, capture cleanup, axes and reset                                                                    | routine          |
| chromium |    2.83 | pass   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 844x390 / touch splitter owns both drag directions without document scrolling at 844x390                         | advisory         |
| chromium |    2.82 | pass   |       0 | editor-workspace.spec.ts / responsive preview, independent scrolling and Fit/Fill across mobile viewports                                                           | routine          |
| chromium |    2.82 | pass   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 390x844 / touch splitter owns both drag directions without document scrolling at 390x844                         | advisory         |
| chromium |    2.67 | pass   |       0 | editor-polish.spec.ts / editor polish / pane-responsive transport is stable, synchronized, accessible, and retains media                                            | advisory         |
| chromium |    2.59 | pass   |       0 | editor-polish.spec.ts / editor polish / fieldset actions align with titles, share responsive pencil styling, and dismiss the range dialog safely                    | advisory         |
| chromium |    2.45 | pass   |       0 | editor-workspace.spec.ts / viewport resize commits the new axis before animation frames without interrupting playback                                               | routine          |
| chromium |    2.44 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 320px                                                                                         | advisory         |
| chromium |    2.44 | pass   |       0 | editor-workspace.spec.ts / named bound actions respect precision, retain Once, and share direct speed state                                                         | advisory         |
| chromium |    2.39 | pass   |       0 | share-routes.spec.ts / Edit layout across viewports, fullscreen=false                                                                                               | advisory         |
| chromium |    2.37 | pass   |       0 | share-routes.spec.ts / Edit layout across viewports, fullscreen=true                                                                                                | advisory         |
| chromium |    2.25 | pass   |       0 | editor-polish.spec.ts / editor polish / two-decimal drafts preserve incoming precision until an explicit edit                                                       | advisory         |
| chromium |    2.24 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 390px                                                                                         | advisory         |
| chromium |    2.23 | pass   |       0 | editor-workspace.spec.ts / layout stays in the upper-right beside mode action without reserving height through resize, reflow and settings scroll                   | advisory         |
| chromium |    2.19 | pass   |       0 | share-footer.spec.ts / native link supports focus, context menu, new tab and keyboard navigation                                                                    | advisory         |
| chromium |    2.17 | pass   |       0 | editor-workspace.spec.ts / form leads in columns; video leads in rows                                                                                               | advisory         |
| chromium |    2.17 | pass   |       0 | editor-polish.spec.ts / editor polish / fractional presentation, unchanged drafts, signed edits, safe blur and repair                                               | advisory         |
| chromium |    2.15 | pass   |       0 | share-footer.spec.ts / footer stays pinned through scroll, narrow widths, layouts and splitter changes                                                              | routine          |
| chromium |    2.11 | pass   |       0 | editor-polish.spec.ts / editor polish / read-only range, modal focus and narrow layout preserve exact bounds and active playback                                    | routine          |
| chromium |    2.09 | pass   |       0 | signed-ranges.spec.ts / same-source range navigation preserves provider and restores bounds on Back: clip                                                           | advisory         |
| chromium |    2.06 | pass   |       0 | framing.spec.ts / mirror preserves crop fixture b90IRPG5UZs                                                                                                         | advisory         |
| chromium |    2.06 | pass   |       0 | share-footer.spec.ts / mobile footer 390x844 / native picture scroll keeps footer and controls independent                                                          | advisory         |
| chromium |    2.06 | pass   |       0 | editor-workspace.spec.ts / workspace stays usable with stale session storage                                                                                        | advisory         |
| chromium |    2.05 | pass   |       0 | editor-workspace.spec.ts / destination layout icon, tooltip and name follow keyboard switches and responsive constraints                                            | advisory         |
| chromium |    1.99 | pass   |       0 | editor-polish.spec.ts / editor polish / compact settings align pills and switches, preserve precise drafts, and fill the transport                                  | advisory         |
| chromium |    1.99 | pass   |       0 | editor-workspace.spec.ts / layout action accepts touch and reset lives only in settings                                                                             | advisory         |
| chromium |    1.97 | pass   |       0 | framing.spec.ts / mirrored watch media survives resize, Theater and available fullscreen                                                                            | advisory         |
| chromium |    1.97 | pass   |       0 | editor-workspace.spec.ts / touch capture and cancellation clean up without changing provider identity                                                               | advisory         |
| chromium |    1.87 | pass   |       0 | video-picker.spec.ts / dialog cancel preserves live media, bounds, title and splitter                                                                               | advisory         |
| chromium |    1.86 | pass   |       0 | editor-workspace.spec.ts / workspace stays usable with blocked session storage                                                                                      | advisory         |
| chromium |    1.81 | pass   |       0 | framing.spec.ts / mirror preserves playing, paused and seeking media with unreflected controls                                                                      | advisory         |
| chromium |    1.77 | pass   |       0 | editor-polish.spec.ts / editor polish / signed range edits, open end and Back/Forward refresh the read-only summary                                                 | advisory         |
| chromium |    1.64 | pass   |       0 | share-footer.spec.ts / loading, invalid bounds and player errors use a non-clickable fallback                                                                       | advisory         |
| chromium |    1.61 | pass   |       0 | signed-ranges.spec.ts / same-source range navigation preserves provider and restores bounds on Back: video                                                          | advisory         |
| chromium |    1.59 | pass   |       0 | share-footer.spec.ts / toolbar reserve at 390x844 / footer follows simulated toolbar collapse without moving the preview or scroll                                  | advisory         |
| chromium |    1.58 | pass   |       0 | share-footer.spec.ts / toolbar reserve at 390x568 / footer follows simulated toolbar collapse without moving the preview or scroll                                  | advisory         |
| chromium |    1.54 | pass   |       0 | editor-workspace.spec.ts / playing YouTube provider and clip survive resize, layout, scroll and responsive reflow                                                   | routine          |
| chromium |    1.50 | pass   |       0 | share-footer.spec.ts / mobile footer 844x390 / native picture scroll keeps footer and controls independent                                                          | advisory         |
| chromium |    1.50 | pass   |       0 | editor-polish.spec.ts / editor polish / duration-relative A links to the resolved absolute YouTube time                                                             | advisory         |
| chromium |    1.30 | pass   |       0 | video-picker.spec.ts / clipboard preview does not commit until Load                                                                                                 | routine          |
| chromium |    1.23 | pass   |       0 | video-picker.spec.ts / preset Basic A:B loop commits canonical state and reloads                                                                                    | routine          |
| chromium |    1.08 | pass   |       0 | video-picker.spec.ts / preset Native portrait commits canonical state                                                                                               | routine          |
| chromium |    1.08 | pass   |       0 | video-picker.spec.ts / preset Landscape crop commits canonical state                                                                                                | routine          |
| chromium |    1.08 | pass   |       0 | video-picker.spec.ts / preset Advanced timing commits canonical state                                                                                               | routine          |
| chromium |    1.04 | pass   |       0 | video-picker.spec.ts / preset Portrait crop commits canonical state                                                                                                 | routine          |
| chromium |    0.70 | pass   |       0 | framing.spec.ts / pending detection survives Orientation Auto without duplicate requests                                                                            | advisory         |
| chromium |    0.53 | pass   |       0 | share-routes.spec.ts / benign root queries retain the empty editor and generic metadata                                                                             | advisory         |
| chromium |    0.52 | pass   |       0 | share-routes.spec.ts / bare root stays generic; malformed and reserved routes are safe                                                                              | routine          |
| chromium |    0.46 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 390px                                                                                                    | routine          |
| chromium |    0.46 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 1280px                                                                                                   | routine          |
| chromium |    0.39 | pass   |       0 | video-picker.spec.ts / dialog whitespace is inert, actual backdrop dismisses, and links fit their visible text                                                      | advisory         |
| chromium |    0.39 | pass   |       0 | video-picker.spec.ts / landing cards expose every preset and directly open a canonical editor clip                                                                  | routine          |
| chromium |    0.37 | pass   |       0 | video-picker.spec.ts / short preview keeps all examples reachable and dialog contains scroll through rotation                                                       | routine          |
| chromium |    0.37 | pass   |       0 | video-picker.spec.ts / one Escape wins over input blur handlers and respects composition                                                                            | routine          |
| chromium |    0.32 | pass   |       0 | video-picker.spec.ts / invisible touch targets / X closes when tapped outside its visible icon                                                                      | routine          |
| webkit   |   10.22 | pass   |       0 | editor-polish.spec.ts / editor polish / generated precision agrees across policies, actual links, history and playback state                                        | advisory         |
| webkit   |    9.89 | pass   |       0 | framing.spec.ts / mirror watch/editor reload, history, false flags and source imports                                                                               | advisory         |
| webkit   |    7.95 | pass   |       0 | editor-polish.spec.ts / editor polish / all live URL policies agree with the share link, preserve bounds and provider                                               | advisory         |
| webkit   |    6.87 | pass   |       0 | editor-polish.spec.ts / editor polish / imported high precision and signed intent survive viewing, reload and generated edits                                       | advisory         |
| webkit   |    6.71 | pass   |       0 | editor-polish.spec.ts / editor polish / late metadata refreshes a read-only long title without requests or remounts                                                 | advisory         |
| webkit   |    5.14 | pass   |       0 | editor-workspace.spec.ts / preview transport, branding and grouped layout fill desktop and mobile viewports                                                         | advisory         |
| webkit   |    3.93 | pass   |       0 | video-picker.spec.ts / candidate metadata is debounced, stale-safe, optional, and never commits playback                                                            | advisory         |
| webkit   |    3.80 | pass   |       0 | editor-polish.spec.ts / editor polish / dialog source drafts, supported links, clipboard previews and title freshness                                               | advisory         |
| webkit   |    3.73 | pass   |       0 | editor-workspace.spec.ts / compact bounds retain signed fractions and refresh after source navigation                                                               | advisory         |
| webkit   |    3.49 | pass   |       0 | editor-workspace.spec.ts / responsive preview, independent scrolling and Fit/Fill across mobile viewports                                                           | routine          |
| webkit   |    3.46 | pass   |       0 | editor-polish.spec.ts / editor polish / pane-responsive transport is stable, synchronized, accessible, and retains media                                            | advisory         |
| webkit   |    3.41 | pass   |       0 | editor-polish.spec.ts / editor polish / original YouTube source link keeps its displayed time and destination in sync                                               | advisory         |
| webkit   |    3.26 | pass   |       0 | share-footer.spec.ts / footer stays pinned through scroll, narrow widths, layouts and splitter changes                                                              | advisory         |
| webkit   |    3.05 | pass   |       0 | editor-workspace.spec.ts / upper-right tooltips fit inside the preview at narrow and wide sizes                                                                     | advisory         |
| webkit   |    3.03 | pass   |       0 | editor-workspace.spec.ts / session preferences restore, reconcile on resize, reset and stay out of share URLs                                                       | advisory         |
| webkit   |    2.92 | pass   |       0 | editor-workspace.spec.ts / viewport resize commits the new axis before animation frames without interrupting playback                                               | routine          |
| webkit   |    2.92 | pass   |       0 | editor-polish.spec.ts / editor polish / fractional presentation, unchanged drafts, signed edits, safe blur and repair                                               | advisory         |
| webkit   |    2.88 | pass   |       0 | editor-polish.spec.ts / editor polish / fieldset actions align with titles, share responsive pencil styling, and dismiss the range dialog safely                    | advisory         |
| webkit   |    2.74 | pass   |       0 | editor-workspace.spec.ts / named bound actions respect precision, retain Once, and share direct speed state                                                         | advisory         |
| webkit   |    2.73 | pass   |       0 | editor-polish.spec.ts / editor polish / compact settings align pills and switches, preserve precise drafts, and fill the transport                                  | advisory         |
| webkit   |    2.68 | pass   |       0 | editor-workspace.spec.ts / layout stays in the upper-right beside mode action without reserving height through resize, reflow and settings scroll                   | advisory         |
| webkit   |    2.65 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 320px                                                                                         | advisory         |
| webkit   |    2.63 | pass   |       0 | editor-workspace.spec.ts / destination layout icon, tooltip and name follow keyboard switches and responsive constraints                                            | advisory         |
| webkit   |    2.59 | pass   |       0 | editor-workspace.spec.ts / layout action accepts touch and reset lives only in settings                                                                             | advisory         |
| webkit   |    2.52 | pass   |       0 | editor-workspace.spec.ts / pointer and keyboard splitter bounds, capture cleanup, axes and reset                                                                    | advisory         |
| webkit   |    2.50 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 1280px                                                                                        | advisory         |
| webkit   |    2.34 | pass   |       0 | framing.spec.ts / three-state overrides, Auto and independent crop at 390px                                                                                         | advisory         |
| webkit   |    2.32 | pass   |       0 | framing.spec.ts / mirrored watch media survives resize, Theater and available fullscreen                                                                            | advisory         |
| webkit   |    2.31 | pass   |       0 | editor-polish.spec.ts / editor polish / signed range edits, open end and Back/Forward refresh the read-only summary                                                 | advisory         |
| webkit   |    2.31 | pass   |       0 | editor-polish.spec.ts / editor polish / two-decimal drafts preserve incoming precision until an explicit edit                                                       | advisory         |
| webkit   |    2.28 | pass   |       0 | share-footer.spec.ts / toolbar reserve at 390x844 / footer follows simulated toolbar collapse without moving the preview or scroll                                  | advisory         |
| webkit   |    2.27 | pass   |       0 | framing.spec.ts / mirror preserves playing, paused and seeking media with unreflected controls                                                                      | advisory         |
| webkit   |    2.26 | pass   |       0 | share-footer.spec.ts / toolbar reserve at 390x568 / footer follows simulated toolbar collapse without moving the preview or scroll                                  | advisory         |
| webkit   |    2.19 | pass   |       0 | editor-polish.spec.ts / editor polish / read-only range, modal focus and narrow layout preserve exact bounds and active playback                                    | advisory         |
| webkit   |    2.17 | pass   |       0 | video-picker.spec.ts / dialog cancel preserves live media, bounds, title and splitter                                                                               | advisory         |
| webkit   |    2.10 | pass   |       0 | share-footer.spec.ts / mobile footer 390x844 / native picture scroll keeps footer and controls independent                                                          | advisory         |
| webkit   |    2.07 | pass   |       0 | editor-workspace.spec.ts / form leads in columns; video leads in rows                                                                                               | advisory         |
| webkit   |    2.04 | pass   |       0 | editor-workspace.spec.ts / workspace stays usable with blocked session storage                                                                                      | advisory         |
| webkit   |    1.90 | pass   |       0 | editor-workspace.spec.ts / workspace stays usable with stale session storage                                                                                        | advisory         |
| webkit   |    1.81 | pass   |       0 | share-footer.spec.ts / native link supports focus, context menu, new tab and keyboard navigation                                                                    | advisory         |
| webkit   |    1.68 | pass   |       0 | share-footer.spec.ts / loading, invalid bounds and player errors use a non-clickable fallback                                                                       | advisory         |
| webkit   |    1.55 | pass   |       0 | share-footer.spec.ts / mobile footer 844x390 / native picture scroll keeps footer and controls independent                                                          | advisory         |
| webkit   |    1.52 | pass   |       0 | editor-polish.spec.ts / editor polish / duration-relative A links to the resolved absolute YouTube time                                                             | advisory         |
| webkit   |    1.39 | pass   |       0 | video-picker.spec.ts / preset Basic A:B loop commits canonical state and reloads                                                                                    | advisory         |
| webkit   |    1.37 | pass   |       0 | framing.spec.ts / mirror preserves crop fixture NSGIZbUbIWw                                                                                                         | advisory         |
| webkit   |    1.37 | pass   |       0 | video-picker.spec.ts / preset Advanced timing commits canonical state                                                                                               | advisory         |
| webkit   |    1.35 | pass   |       0 | framing.spec.ts / mirror preserves crop fixture b90IRPG5UZs                                                                                                         | advisory         |
| webkit   |    1.27 | pass   |       0 | video-picker.spec.ts / preset Portrait crop commits canonical state                                                                                                 | advisory         |
| webkit   |    1.26 | pass   |       0 | video-picker.spec.ts / clipboard preview does not commit until Load                                                                                                 | advisory         |
| webkit   |    1.23 | pass   |       0 | video-picker.spec.ts / preset Landscape crop commits canonical state                                                                                                | advisory         |
| webkit   |    1.23 | pass   |       0 | editor-workspace.spec.ts / playing YouTube provider and clip survive resize, layout, scroll and responsive reflow                                                   | routine          |
| webkit   |    1.11 | pass   |       0 | video-picker.spec.ts / preset Native portrait commits canonical state                                                                                               | advisory         |
| webkit   |    0.73 | pass   |       0 | framing.spec.ts / pending detection survives Orientation Auto without duplicate requests                                                                            | advisory         |
| webkit   |    0.53 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 1280px                                                                                                   | routine          |
| webkit   |    0.52 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 390px                                                                                                    | routine          |
| webkit   |    0.43 | pass   |       0 | video-picker.spec.ts / dialog whitespace is inert, actual backdrop dismisses, and links fit their visible text                                                      | advisory         |
| webkit   |    0.39 | pass   |       0 | video-picker.spec.ts / one Escape wins over input blur handlers and respects composition                                                                            | routine          |
| webkit   |    0.39 | pass   |       0 | video-picker.spec.ts / landing cards expose every preset and directly open a canonical editor clip                                                                  | advisory         |
| webkit   |    0.36 | pass   |       0 | video-picker.spec.ts / short preview keeps all examples reachable and dialog contains scroll through rotation                                                       | routine          |
| webkit   |    0.32 | pass   |       0 | video-picker.spec.ts / invisible touch targets / X closes when tapped outside its visible icon                                                                      | routine          |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / touch capture and cancellation clean up without changing provider identity                                                               | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 390x844 / touch splitter owns both drag directions without document scrolling at 390x844                         | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 844x390 / touch splitter owns both drag directions without document scrolling at 844x390                         | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 390x844 / settings scroll independently; picture swipes scroll the document without changing playback at 390x844 | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / mobile pane scrolling / 844x390 / settings scroll independently; picture swipes scroll the document without changing playback at 844x390 | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / automatic mobile document scrolling / 390x844 / video scrolls the document while settings, splitter and live provider stay independent   | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / automatic mobile document scrolling / 844x390 / video scrolls the document while settings, splitter and live provider stay independent   | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / short controls 390x844 / fitting controls retain gesture ownership and provider identity                                                 | advisory         |
| webkit   |    0.00 | skip   |       0 | editor-workspace.spec.ts / short controls 844x390 / fitting controls retain gesture ownership and provider identity                                                 | advisory         |

## Routine individual duration ranking

Each row is one browser execution, ordered by duration within its browser. Scenario paths distinguish viewport/flag matrices. Status is the actual run result; retries are shown explicitly.

| Browser  | Seconds | Status | Retries | File / scenario                                                                                                                  | Gate disposition |
| -------- | ------: | ------ | ------: | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| chromium |    6.66 | pass   |       0 | watch-playback-scope.spec.ts / selected scope obeys Loop with legacy routing at clip and video end                               | routine          |
| chromium |    5.77 | pass   |       0 | watch-playback-scope.spec.ts / selected scope obeys Once at clip and video end                                                   | routine          |
| chromium |    4.22 | pass   |       0 | editor-polish.spec.ts / editor polish / imported high precision and signed intent survive viewing, reload and generated edits    | routine          |
| chromium |    3.27 | pass   |       0 | signed-ranges.spec.ts / signed fractions survive watch/editor/copy/reload/history and explicit bound edits                       | routine          |
| chromium |    3.25 | pass   |       0 | share-routes.spec.ts / editor aliases, live state, canonical sharing, reload and Back/Forward                                    | routine          |
| chromium |    1.93 | pass   |       0 | signed-ranges.spec.ts / signed range obeys Loop at resolved B                                                                    | routine          |
| chromium |    1.92 | pass   |       0 | signed-ranges.spec.ts / signed range obeys Once at resolved B                                                                    | routine          |
| chromium |    1.78 | pass   |       0 | editor-workspace.spec.ts / responsive preview, independent scrolling and Fit/Fill across mobile viewports                        | routine          |
| chromium |    1.62 | pass   |       0 | editor-workspace.spec.ts / playing YouTube provider and clip survive resize, layout, scroll and responsive reflow                | routine          |
| chromium |    1.55 | pass   |       0 | editor-polish.spec.ts / editor polish / read-only range, modal focus and narrow layout preserve exact bounds and active playback | routine          |
| chromium |    1.54 | pass   |       0 | signed-ranges.spec.ts / invalid watch clips retain Edit and can be repaired: mute                                                | routine          |
| chromium |    1.54 | pass   |       0 | signed-ranges.spec.ts / invalid watch clips retain Edit and can be repaired: once&mute&speed=1.5&vertical=0&fill=0               | routine          |
| chromium |    1.51 | pass   |       0 | share-footer.spec.ts / footer stays pinned through scroll, narrow widths, layouts and splitter changes                           | routine          |
| chromium |    1.39 | pass   |       0 | editor-workspace.spec.ts / pointer and keyboard splitter bounds, capture cleanup, axes and reset                                 | routine          |
| chromium |    1.36 | pass   |       0 | video-picker.spec.ts / clipboard preview does not commit until Load                                                              | routine          |
| chromium |    1.30 | pass   |       0 | editor-workspace.spec.ts / viewport resize commits the new axis before animation frames without interrupting playback            | routine          |
| chromium |    0.66 | pass   |       0 | video-picker.spec.ts / preset Basic A:B loop commits canonical state and reloads                                                 | routine          |
| chromium |    0.63 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 390px                                                                 | routine          |
| chromium |    0.63 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 1280px                                                                | routine          |
| chromium |    0.53 | pass   |       0 | video-picker.spec.ts / preset Advanced timing commits canonical state                                                            | routine          |
| chromium |    0.53 | pass   |       0 | video-picker.spec.ts / preset Portrait crop commits canonical state                                                              | routine          |
| chromium |    0.52 | pass   |       0 | video-picker.spec.ts / preset Native portrait commits canonical state                                                            | routine          |
| chromium |    0.52 | pass   |       0 | video-picker.spec.ts / preset Landscape crop commits canonical state                                                             | routine          |
| chromium |    0.50 | pass   |       0 | video-picker.spec.ts / one Escape wins over input blur handlers and respects composition                                         | routine          |
| chromium |    0.47 | pass   |       0 | video-picker.spec.ts / landing cards expose every preset and directly open a canonical editor clip                               | routine          |
| chromium |    0.45 | pass   |       0 | video-picker.spec.ts / invisible touch targets / X closes when tapped outside its visible icon                                   | routine          |
| chromium |    0.43 | pass   |       0 | share-routes.spec.ts / bare root stays generic; malformed and reserved routes are safe                                           | routine          |
| chromium |    0.42 | pass   |       0 | video-picker.spec.ts / short preview keeps all examples reachable and dialog contains scroll through rotation                    | routine          |
| webkit   |    1.82 | pass   |       0 | editor-workspace.spec.ts / responsive preview, independent scrolling and Fit/Fill across mobile viewports                        | routine          |
| webkit   |    1.48 | pass   |       0 | editor-workspace.spec.ts / viewport resize commits the new axis before animation frames without interrupting playback            | routine          |
| webkit   |    1.35 | pass   |       0 | editor-workspace.spec.ts / playing YouTube provider and clip survive resize, layout, scroll and responsive reflow                | routine          |
| webkit   |    0.68 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 1280px                                                                | routine          |
| webkit   |    0.63 | pass   |       0 | video-picker.spec.ts / empty root and first-open picker at 390px                                                                 | routine          |
| webkit   |    0.54 | pass   |       0 | video-picker.spec.ts / one Escape wins over input blur handlers and respects composition                                         | routine          |
| webkit   |    0.45 | pass   |       0 | video-picker.spec.ts / invisible touch targets / X closes when tapped outside its visible icon                                   | routine          |
| webkit   |    0.40 | pass   |       0 | video-picker.spec.ts / short preview keeps all examples reachable and dialog contains scroll through rotation                    | routine          |
