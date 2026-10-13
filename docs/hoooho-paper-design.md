# Hoooho paper visual migration

Product-owner authorization: 2026-10-13; apply approved paper direction throughout the existing product.

## Contract

- Preserve all existing wording, information, ordering, routes, page relationships and business/API/data behavior.
- Preserve both nurse characters, original video/poster assets, playback and animations. Keep their white media wrappers so the opaque source footage remains intact.
- Preserve the side drawer, its slide direction, each expandable group and each navigation handler. Change appearance only.
- Extend the existing `--hoho-*` foundations; do not introduce another UI framework or dependency.

## Shared foundations

Plaster page `#F4F2ED`, paper `#FCFBF7`, ink `#273332`, moss action `#486253`, stone borders `#D6DAD3`. Keep semantic medical/error/calendar colors and factual labels.

Headings use self-hosted Noto Serif SC; body uses Noto Sans SC with system fallbacks. Both fonts are locally subset from public SIL OFL assets to the application glyph inventory. Unknown user-entered characters fall back to system fonts. Licenses accompany assets. Text keeps existing type roles and data uses tabular numerals.

`paper.css` applies subtle repeatable fiber grain, paper edge light and restrained shadows to shared cards, sheets, navigation groups and documents. It does not position or reorder content. Home actions retain their handlers and labels; compact widths avoid large full-width slabs.

## State feedback

- Home follow-up compares actual fetched description/time with the last view in memory. Only changed description/time highlight, including when returning to the home page; first load and unchanged content do not animate.
- Report content fades only after a real organization operation completes successfully. Cached reports do not replay generation; no simulated typing or fixed request delay is introduced.
- Speech feedback observes the same MediaStream used for recording. RMS drives the wave and halo; silence contracts the cue. No second microphone request, transmitted audio or transcription changes. Stop/discard/unmount close the analysis context independently of the recorder.
- Reduced motion removes content animation; existing focus, loading, disabled and touch-target contracts remain.

## Rollback

Pre-change source: `addce69ab72f45b17d3d9deb46cad0dba08e4197`, branch `backup/pre-paper-20261013`.

Revert the isolated UI commit, or redeploy the preceding known-successful source build. Do not restore/delete the data volume; newly added records are independent of the UI code release.

## Verification

- `TZ=Asia/Shanghai npm run test:client`: 642 passing. The product's existing natural-day tests require its Asia/Shanghai reference timezone.
- `npm run build`: TypeScript, image/avatar/body assets, production bundling, viewport, auth-build and install configuration checks.
- `npm run test:media`: MP4 range behavior and original nurse media contracts.
- `tests/paper-design`: 17 existing route surfaces and sidebar operation at 375px, 430px and 1280px; real WebAudio oscillator stream tests amplitude, silence and stop/release. Screenshots wait for local fonts and mounted report content.
- Local AI requests without credentials intentionally exercise existing 503 recovery; live provider accuracy is outside this visual change. The older September design suite contains obsolete self-member fixtures and /guide routing assumptions; use the current child fixture and existing /guide -> /help route contract.

Run browser checks with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using a locally supplied Chromium executable. No new runtime dependency.
