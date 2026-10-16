# Overview selection acceptance — 2026-10-16

Base: canonical Hoooho-app/hoooho.app origin/main 449c3e644d59f5ec5de0bbe59a6e5916510b9ea2. Working tree clean; branch codex/approved-overview-ui-20261016.

Authority is the user's spoken selection of Hoooho_UI_Overview_2026-10-16.pdf, not the detailed Proposal document or audit's 323 recommendations.

- [x] Board 1 panels 1–3: actionable organized result, visible processing and stop, failure retry/save original. Preserve existing recognition job reliability and exit/draft behavior. Panel 4 review page frozen.
- [x] Board 2 panels 3–4 only: manual sleep 24-hour ring + time cards + duration + explicit time confirmation; stool time first, readable shape/color choices, optional photo lower. Preserve all actual choices and structured data; no fabricated example facts.
- [x] Board 3: member header, continuous five-row profile directory with actual counts, bottom upload; compact category navigation; overflow management; family edit sheet; vaccination dates visible and extra age groups under More. Editing, deletion, drafts, undo, existing APIs and legacy records remain functional.
- [x] Board 5: date records bottom sheet only, compact icon/time/summary/detail rows with no duplicate full-record expansion. Follow-up summary + keyword + latest/first times + visible timeline + supplement + recovery; include explicit edit and delete as requested.
- [x] Board 6: only duplicate-record prompt, clear update/create/cancel; closing preserves unsaved input and attachments.
- [x] Diff excludes symptom/feeding, visit sheet, day/month calendar, lookup/search, visit/medication forms, dietary card, settings/support and login/account; homepage/nurses/assets frozen. Shared CSS must be scoped.
- [x] Build, relevant client/server checks, mobile browser normal/failure/retry/close/save behavior, 375/390/430 widths, diff scope check.
- [ ] Commit/push/main, isolated Staging verification, Production verification. Browser emulation is not physical iPhone acceptance.

## Implementation dependencies and validation

- Follow-up management uses a small case-scoped PATCH/DELETE adapter over existing caseTitle and existing event deletion semantics. Ownership, root version, group membership and all source changes are checked inside the account transaction; unread markers are removed only for acknowledged deleted IDs.
- Failed recognition can save originals through the existing case capture route without calling a model. Raw-save request identity is stable; a saved-guide checkpoint survives lost local writes; the old recognition task is durably cancelled after formal save acknowledgement. Safari codec/container validation and HEIC validation reuse existing helpers. New raw notes do not create a symptom-followup unless recording into an existing case.
- Existing facts, source media, all 7 stool shapes/8 colors and 5 profile categories remain. No example diagnoses, dates, counts or identities were copied from the illustration.
- Build including TypeScript and repository asset/auth/viewport/install checks: PASS.
- Client suite with TZ=Asia/Shanghai: 653 PASS.
- Case continuity and child profile service suite: 27 PASS, including concurrent child change deletion rejection, ownership, merged deletion, Safari original bytes and no-model idempotency.
- tests/overview-approved: 7 mobile browser scenarios PASS. Captures at 320/375/390/430px. Includes all profile CRUD/undo, date sheet detail/focus, duplicate close preservation, sleep confirmation, stool fields/6-photo recovery/upload retry, actual pause/resume, and raw-save lost-acknowledgement retry without model calls.
- AI browser coverage uses the isolated Bailian fixture, not real provider latency measurement. Browser emulation does not constitute physical iPhone/Safari acceptance or final product-owner visual signoff.
- No production dependency added; no nurse/media assets, homepage, symptom/feeding form, visit sheet, calendar main views, search, dietary card, settings or authentication page changed.
