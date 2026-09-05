# Health journal nurse video reliability

Scope: the existing nurse desk media, its necessary spacing, and MP4 static delivery. Recording, transcription, upload, preview, atomic save, parser and data contracts are unchanged.

## Findings and repair

- The old component mounted four `preload=auto` videos, called `load()` for all, and permanently placed a static attention image below them. Each video also had the same poster. It used `playing` rather than presented-frame evidence and left the old player visible during the next clip's preparation. No stalled-frame watchdog existed. `canplay` and `loadeddata` could both start the pending player; recovery state was spread over effects and mutable sessions.
- The new controller owns stable players, assigns only the current source initially, and prepares one next idle source after foreground frames arrive. Save media is requested only after the existing successful voice-save signal; text-save semantics are preserved. Source URLs and nodes remain stable across recorder renders and list/front-desk switching. Member changes retain the existing reset boundary.
- Two advancing presented frames reveal media. At 1.2 seconds without progress (200 ms polling tolerance), hide it. End, pause, error and lifecycle suspension hide it immediately. Eight seconds without recovery triggers at most two retries per clip per mounted session; exhausted clips are excluded. A playing predecessor may continue until the successor outputs frames, but an ended predecessor cannot remain visible.
- Modern browsers use `requestVideoFrameCallback`. Older WebKit uses advancing decoded-frame counters; when the API is absent or always zero, a never-displayed 32x32 canvas verifies changing decoded pixels. This is detection only, never a poster or image fallback. Background/inactive pages do not sample pixels. Reduced-motion preference leaves the decoration white.
- MP4 static delivery previously returned the whole file for Range requests. It now supports 206 single byte ranges, suffix/open ranges, 416, ETag/304, and If-Range. Existing immutable caching and hashed asset URLs remain. Other static formats and all APIs retain their behavior.
- Desk width changes from `min(76%, 340px)` to `min(60.8%, 272px)` with square, centered `object-fit: contain`. The recorder's content rows keep tight spacing and a stable media footprint when blank.

## Assets

Decimal bytes; the original files remain preserved, but only mobile imports enter the page bundle. All source files were H.264 Main, yuv420p, 24 fps, 960x960, with no audio stream. All mobile files are H.264 Main level 3.1, yuv420p, 24 fps, 576x576, square pixels, no audio, and MP4 faststart. Retaining 24 fps avoids unnecessarily degrading these short gestures.

| Clip | Before bytes | After bytes | Duration before / after | Video bitrate before / after (kb/s) | Reduction |
| --- | ---: | ---: | --- | --- | ---: |
| Welcome | 2,308,101 | 232,956 | 6.04 / 6.00 s | 3053 / 307 | 89.9% |
| Idle 1 | 1,866,050 | 161,074 | 6.04 / 6.00 s | 2468 / 211 | 91.4% |
| Idle 2 | 2,386,403 | 249,672 | 6.04 / 6.00 s | 3157 / 329 | 89.5% |
| Save success | 1,163,455 | 111,750 | 3.04 / 3.00 s | 3055 / 293 | 90.4% |
| Total | 7,724,009 | 755,452 | | | 90.2% |

Reproduce with `node scripts/optimize-nurse-media.mjs <ffmpeg-path>` (refuses to overwrite existing mobile files). FFmpeg 7.1, Lanczos 576px, CRF 24, slow preset, 850k maximum / 1700k buffer, GOP 48, faststart. `npm run test:media` checks size budgets, MP4 box ordering and byte-range boundaries. Side-by-side samples from every clip at the display size retained faces, desk and gestures without visible block artifacts or new background seams.

## Verification and release procedure

- `npm run test:client`, `npm run test:server`, `npm run test:media`, `npm run build`, `git diff --check`.
- `npx playwright test --config tests/quick-record-mobile/playwright.config.ts`: real Chrome decoder with iPhone SE device parameters; 375/390/430 layouts; first entry, refresh, cache reuse, two idle cycles, delayed/limited media, failed requests, blocked autoplay, stale frames and fresh-frame recovery, view/lifecycle switching. The existing local backend tests cover dictation/preview/photos/save with mocked microphone and speech recognition, and now verify the successful voice gesture returns to idle.
- `npx playwright test --config tests/quick-record-mobile/webkit-media.config.ts`: installed Windows WebKit, using port 4206 because WebKit restricts 4190. This engine lacks the frame callback, reports zero total frames despite decoded pixels, and reports rendered rather than encoded video dimensions; the fallback verifies pixels and byte tests verify asset identity.
- For each real deployment, set `NURSE_BASE_URL` to its verified domain and run `online-media.config.ts`. It loads deployed JS/CSS/MP4, checks public health, byte-identical compressed assets, Range/304, motion and switching. Only business API requests are redirected to an isolated local fixture: it does not write production health data or claim authenticated Production recording acceptance.
- Local Chrome first visible motion was approximately 0.49 seconds, and two complete idle transitions requested just intro/idle1/idle2 once each. Cache re-entry returned zero transferred bytes for welcome and idle1. These are local measurements, not a promised mobile-network latency.

Physical iPhone/Safari, actual microphone capture, OS lock/unlock, and real-device background power management require manual acceptance. Synthetic lifecycle events and desktop engine emulation are not real-device results. Release commit IDs, Railway deployment IDs and online outcomes are reported in the delivery response, not inferred from a successful push.
