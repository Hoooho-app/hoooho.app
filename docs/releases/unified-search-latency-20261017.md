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
- [x] Build, client/server regression checks and mobile browser operation pass, followed by commit/main/Staging verification/Production verification.

Frozen: V2 design tokens, unrelated page layouts, health data semantics, models/provider/region, other smart-record workflows. Browser emulation is not physical iPhone acceptance. A faster supplier response is not claimed from mocked tests.

Validation before release:
- Full build passed; client checks 684/684 before the two additional API cancellation tests (both pass).
- Quick-search mobile suite: seven main cases passed, plus separate original-recording finalization and hung-file-read cases passed.
- Audio server suite: five cases passed, including real ffmpeg MP4-to-MP3 conversion and invalid/long/cancelled inputs.
- Calendar filter/view/search-return browser check passed in an isolated fixture. The standard fixture has a shared shutdown marker, so concurrent runners can stop each other's server; this is test setup, not app behavior.
- Four pre-existing source-contract failures were reproduced on the original base and updated to the already-approved visit-materials implementation; no visit behavior changed. The search-specific contract now checks the shared component.
- Physical iPhone/Safari and real-user latency percentiles remain unverified; live synthetic supplier samples will be reported separately.


Final release evidence (2026-10-17):
- Application changes merged via #458; release helper via #459; query precomputation via #461.
- Final deployed application commit: `c9d487be32c7c7fc8148160f48acf5c72953fe2d`. It includes the approved concurrent visit-materials changes without altering the search implementation.
- Staging deployment `e1d6a98a-d924-4180-9281-896ab3605901`: SUCCESS; authenticated search acceptance PASS with a real MP4/AAC sample converted to MP3 before Bailian ASR.
- Production deployment `5bc1569e-44fe-47be-b1f1-bc7fa7a40b7c`: SUCCESS; authenticated search acceptance PASS with real compressed WebM ASR.
- Both environments verified shared home/calendar voice lookup, fuzzy results, no ASR-triggered index reload, fresh entry, original-record detail, calendar view/sort return, and 320/375/390px waiting/control placement. Synthetic members were removed after each run. Existing synthetic QA login was reused when registration was throttled; no authentication, rate-limit or ASR quota settings changed.
- Final client checks: 686/686; quick-search browser suite: 9/9; audio service checks: 5/5. Login recovery and smart-record cloud checks passed. New/old query implementations matched on 60 extended comparisons of IDs, order, related/reason/evidence.

Query preparation benchmark: Node24, 10,000 synthetic mixed records across 90 days, median of three runs. Excludes index loading, network and DOM; not a physical-phone measurement.

| Query | Before | After |
| --- | ---: | ---: |
| Skin over two months | 2,098 ms | 162 ms |
| Meat over two months | 4,700 ms | 247 ms |
| Outdoor activity over two weeks | 598 ms | 50 ms |
| Fever | 1,142 ms | 381 ms |

Live ASR availability/latency samples use the same 2.65-second synthetic English speech. External round trips include this workstation's proxy, upload and JSON parsing. Service elapsed includes local preparation and supplier networking/processing; neither metric is pure model inference or a real-user percentile.

| Sample | Input bytes | External round trip | Service elapsed |
| --- | ---: | ---: | ---: |
| Pre-release WAV | 85,038 | 6,185 ms | 1,322 ms |
| Pre-release compressed WebM comparison | 16,926 | 5,521 ms | 875 ms |
| Final Staging MP4 | 17,762 | 6,858 ms | 2,194 ms |
| Final Production WebM | 16,926 | 9,043 ms | 2,725 ms |

Staging MP4 preparation took 343 ms and produced 16,991 bytes of MP3. Browser preparation preserved WebM at 16,926 bytes instead of expanding it to 85,002 WAV bytes. Live samples show network variability; no universal ASR latency improvement or phone percentile is claimed. The existing qwen3-asr-flash model and region remain in use. Physical iPhone/Safari verification and real-user latency distributions are still unverified.
