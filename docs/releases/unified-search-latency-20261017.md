# Unified quick search and bounded voice waiting

Base: `b5c64f4f96760b93fa470da8b7c75b1c49248d94`; branch `fix/unified-search-latency-20261017`; clean base.

Confirmed scope: both search entry points use the existing home quick-search UI and matching rules, including hold-to-talk and magnifier waiting. Optimize the existing ASR transport and waiting lifecycle; deployment is authorized.

Acceptance checklist:
- [x] Home and calendar search render the same component, voice input, fuzzy matching and one-line results.
- [x] Calendar return preserves view/date/query/hash/scroll; every search entry starts empty and late responses cannot fill another session.
- [x] Transcription POST does not trigger journal refresh; real health writes still refresh.
- [x] Concurrent journal loads are deduplicated within account/token/member/timezone and expire; no cross-account/member result leakage.
- [x] Quick-search audio stays compressed; Safari MP4 is actually transcoded on the server, with bounds and cancellation. Other smart-record audio preparation remains unchanged.
- [x] The 25-second release-to-transcript deadline ends waiting even when preparation/recovery does not settle. Errors restore typing and recording.
- [x] Existing magnifier animation/reduced motion, simple inline error, and no saved-recording banner/recovery card remain.
- [ ] Build, client/server regression checks and mobile browser operation pass, followed by commit/main/Staging verification/Production verification.

Frozen: V2 design tokens, unrelated page layouts, health data semantics, models/provider/region, other smart-record workflows. Browser emulation is not physical iPhone acceptance. A faster supplier response is not claimed from mocked tests.

Validation before release:
- Full build passed; client checks 684/684 before the two additional API cancellation tests (both pass).
- Quick-search mobile suite: seven main cases passed, plus separate original-recording finalization and hung-file-read cases passed.
- Audio server suite: five cases passed, including real ffmpeg MP4-to-MP3 conversion and invalid/long/cancelled inputs.
- Calendar filter/view/search-return browser check passed in an isolated fixture. The standard fixture has a shared shutdown marker, so concurrent runners can stop each other's server; this is test setup, not app behavior.
- Four pre-existing source-contract failures were reproduced on the original base and updated to the already-approved visit-materials implementation; no visit behavior changed. The search-specific contract now checks the shared component.
- Physical iPhone/Safari and real-user latency percentiles remain unverified; live synthetic supplier samples will be reported separately.
