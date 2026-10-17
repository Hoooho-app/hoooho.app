# Quick search waiting and voice latency — 2026-10-17

Base: `2952a79a5dde3694fd6f657fec5d6b7d9e5d110c`, clean isolated branch `fix/quick-search-progress-20261017` from current origin/main.

Acceptance scope:

- Remove the “录音已保留” notice in Quick Search. Keep silent original retention and failure recovery.
- Improve search responsiveness and unnecessary audio preparation work without changing the model, search semantics, records, or other page layouts.
- Immediate feedback after release; moving magnifier while preparing, recognizing, retrieving or delivering results. Actual states, no invented percentage or minimum waiting time.
- No premature empty state or unavailable retry controls during recognition. Fast local searches avoid loading flashes. Long requests show a short waiting hint; failures offer retry and text input.
- Preserve scoped drafts, automatic voice search, fuzzy/date matching, one-line rows and original details. Respect reduced motion and 320/375/390px mobile layouts.

Observed production evidence (read-only, before change): ASR requests on the base version completed in 20,489ms and 12,720ms; a third was cancelled after 59,679ms while waiting for the supplier. The last failure used a reused connection; this does not establish a DNS/TLS problem. Search semantics run locally after ASR, without a second model round trip. No transcript or recording content was read from logs.

Implementation:

- Lookup opts into conservative edge-silence trimming: 20ms windows, -60dB RMS threshold, 400ms padding on both ends; interior pauses and originals remain intact. All-quiet audio stays unchanged. The WAV remains 16kHz mono PCM. Other recording entrances do not opt into trimming.
- Lookup prepares WAV concurrently with saving the original, then waits for persistence before contacting ASR. The hook caches prepared audio and successful transcripts per File using WeakMaps, avoiding repeated decoding or supplier calls when only downstream delivery failed.
- Lookup uses a 25s bounded attempt instead of a 60s indefinite-looking wait; explicit retry reuses the same recording. No automatic duplicate calls, supplier switch or backend configuration change.
- Text debounce 300ms -> 120ms, non-urgent result transition; purely local waiting visuals appear only after 180ms. Voice preparation/recognition feedback appears immediately; results fade in with normal motion tokens. An 8s hint acknowledges prolonged waiting.
- The magnifier loops gently across faint record lines. Reduced-motion preference disables movement.

Validation:

- Production build and TypeScript: PASS.
- Client suite: 661/661 PASS with the project's Asia/Shanghai timezone. An initial run with the host timezone failed date-specific expectations; no unrelated source changes were made.
- Targeted audio and finder tests: 22/22 PASS, including trimmed PCM duration, quiet speech, original retention, interior pauses, and all-quiet fallback.
- Mobile Chromium: 3/3 PASS after the final non-flashing refinement, including the 8s hint and loading layouts at 320/375/390px, animated transform changes, reduced motion, the same audio payload on retry and settled results.
- Synthetic timing fixture: 6s audio including quiet edges becomes 2.8s (53% fewer PCM payload bytes). This is a controlled preparation test, not a measured claim of supplier latency improvement.

The product owner approved the interactive proposal and authorized implementation/deployment on 2026-10-17 at 15:52 Asia/Shanghai. Physical iPhone/Safari recording and measured before/after supplier latency remain unverified; deployed visual acceptance is separate from proposal approval. Supplier latency variability is not eliminated by these changes.

Integration base refreshed by clean rebase to `edf3e26ad356777f42be0a98b4af661c904ffd6a`; unrelated source retained.

Release resumed after explicit user approval to implement and deploy. The earlier push was blocked by automatic approval review and no alternate publishing path was attempted. Staging and Production release verification is pending below; no DONE claim before both environments pass.
