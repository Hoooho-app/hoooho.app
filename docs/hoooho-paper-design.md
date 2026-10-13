# Hoooho paper visual migration

Product-owner authorization: 2026-10-13; apply approved paper direction throughout the existing product.

## Contract

- Preserve all existing wording, information, ordering, routes, page relationships and business/API/data behavior.
- Preserve both nurse characters, original video/poster assets, playback and animations. Keep their white media wrappers so the opaque source footage remains intact.
- Preserve the side drawer, its slide direction, each expandable group and each navigation handler. Change appearance only.
- Extend the existing `--hoho-*` foundations; do not introduce another UI framework or dependency.

## Shared foundations

Plaster page `#F4F2ED`, paper `#FCFBF7`, ink `#273332`, moss text/accent `#486253`, stone borders `#D6DAD3`. The product owner restored the previous moss `#486253` filled button palette after reviewing Qingrun green. Action tokens alias the original moss normal/hover/pressed colors; current white text/icons and all material fixes are retained.

The follow-up material fix gives the drawer an opaque paper base below translucent grain, joins shared headers to the plaster page material, covers dedicated dietary/medication surfaces, and blends the white nurse wrapper into the surrounding paper without changing source media or playback.

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

Follow-up scope: moss filled controls with pure white content, opaque drawer base, page-colored headers and large dietary/report/medication wrappers. Original nurse media remains byte-identical; a soft white-to-paper backdrop bridges the opaque footage. The legacy Header uses the same material class; no layout or navigation handler changes.

## Authorized homepage revision, 2026-10-14

The product owner approved the preview and requested implementation. Preserve the child information board and sidebar. Below the board, show symptom follow-up before the health jot card; move the visit-summary action into follow-up and shorten its home label to “情况单”. “情况单” is primary moss and “情况跟进” is outlined secondary. Keep the action available when no symptom is being followed. Symptom title/keyword and the two dates each occupy one compact line; the duplicate description is removed. The card has a subtle folded corner; one item uses one sheet, two items two sheets, three or more at most three sheets.

Reuse `RecordEntryActions` inside the health jot card, including its exact text-only category row, daily option popover and full-width large “智能记录” button. Home category actions open the existing calendar record forms with member identity and feeding kind preserved. Smart recording preserves its existing front-desk source/return state. No API, record, nurse artwork/video or navigation changes.

Validation: 644 client checks, production build, and 66 browser checks across 375px, 430px and 1280px. Added browser coverage checks the full-width alignment, labels fitting in one row, count-based layer cap, empty follow-up access, seven manual record destinations and returns, and the three main destinations. Prior home description feedback is superseded by latest-update feedback because the description is no longer displayed.

## SE homepage refinement, 2026-10-14

Product-owner feedback from an actual phone screenshot: the browser toolbar hid the smart-record action. The member homepage now uses the existing compact 56px header; a local short-viewport spacing rule preserves every control's 44px touch target and the 50px full-width smart action. Validate the whole three-card page at 375×548 usable CSS pixels, including the three-sheet case, without scrolling or clipping. Normal/taller layouts retain their spacing and scrolling remains available when required.

Remove the health-jot date/week and separate past/current-time hint. Place the original nurse footage in the upper-right of the title/copy grid on its white surface. Preserve footage, poster, playback and reduced-motion behavior; only the white media framing changes.

Name the home follow-up card “健康事件”; use an outlined medical cross for the heading and symptom preview. Rename its existing /cases action and that secondary page's header to “症状跟进”. Both symptom-follow-up and situation-sheet buttons are moss with white centered text and no icons. This is an exact home-card terminology exception; other health-jot module names are unchanged.

The child-information board, event sheet and backing sheets opt into a stronger static SVG paper-fiber texture. A clipped top corner, shaded underside and crease form the small folded corner; offset warm textured backing sheets preserve the one/two/maximum-three count rule. The nurse card remains white. No backend/API/data/AI, record-entry styling or sidebar changes.

Refinement validation: 646 client checks; production build and original nurse-media checks; 69 browser checks, including 375×548 usable height, all buttons fully visible, no main-page scrolling, both primary text-only actions, medical cross and folded/textured sheets, original record forms and the renamed secondary header/back action.
