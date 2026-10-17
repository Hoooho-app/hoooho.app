# Smart record refinement — 2026-10-18

Base: canonical `Hoooho-app/hoooho.app`, `origin/main` at `661562b`. Work is isolated in `fix/smart-record-event-and-ui-20261018`; unrelated uncommitted work in the prior checkout is preserved.

## Acceptance scope

- One injury/symptom occurrence, its material-upload action, clinician statement and observation requirement form one draft item and one saved record. Independent routine inputs, tests, archives, distinct dates/clocks, conflicting facts and ambiguous source pages remain separate. Model/provider configuration is unchanged.
- Raw wording, quoted evidence and original attachments survive save and idempotent retry. An upload action is not a separate health fact. Three-photo regression coverage verifies original retention.
- Live parent narration without an occurrence phrase retains its recording clock. Explicit saved period/unknown precision survives calendar indexing and read projection. The month sheet and day timeline never label an imprecise occurrence as midnight.
- Remove inline voice playback from smart-record bubbles; retain byte originals and retries. Use the existing body-small token and compact horizontal progress steps, real checkpoints and a stop action.
- Review controls display green text “编辑”. Delete is inside the record-name editor; add and save continue to work.
- Remove new-record/view-record banners from calendar, symptom followup and profile pages. Month cells carry dots; opening the matching date clears its notices. Opening the day calendar clears calendar/symptom notices after successful load. Opening a profile section clears all its entry notices. Other sections/accounts/members remain scoped.
- The day sheet contains one short line per record, without attachment counts. Details retain originals and attachments.

## Local verification

- 212 server checks: recognition jobs, front-desk dialogue, business extraction/save, journal metadata and calendar index.
- 57 client checks: record-update store/day mapping, calendar presentation/navigation, business helpers and followup presentation.
- 23 Playwright scenarios: recognition progress/recovery, voice input without playback, review edits/deletion, single-incident save, month/date dots, day opening and section-level reads.
- Browser interaction and screenshots checked at 320, 375 and 390 CSS px. Chromium emulation is not physical iPhone/Safari acceptance.
- Full production build includes type checking, image/avatar/body assets, viewport, authentication and installation checks.

## Release verification

The release uses the normal `main → Staging verification → Production verification` chain. Run `tests/dialogue/smart-record-refinement-live.mjs` against each verified deployment with its expected commit. It uses only a new or retained synthetic test account, creates a new synthetic member, verifies the configured real model and changed calendar controls, and removes the synthetic member afterward. `HOOOHO_TEST_SESSION_FILE` may point to an existing local synthetic test session; its origin and authenticated account identity must match. No credentials are committed. Model failure is reported immediately with its business code and raw-retention state.

`tests/dialogue/smart-record-calendar-live.mjs` separately verifies real CRUD, preserved date precision, short day-sheet phrases and shallow notice reads without model calls. This check does not stand in for real model acceptance.

App release commit: `4494a6b9c98db5bd2d8d71e084bde0aeb62c97f2` (PR #470). GitHub verification run `39061049671` passed all steps. Staging deployment `7df528db-6302-4ff6-8d9b-0b8b30c7eca3` and Production deployment `d9b96ae3-9aea-418f-8c15-dee2d385babf` both reached `SUCCESS`.

Authenticated live calendar/CRUD checks passed in both environments at 320/375/390 CSS px: exact vs period readback, date-positioned dots, date-open acknowledgement without opening individual records, one-line phrases without attachment counts, day-page reads and profile-section reads. All created synthetic members and their records were removed.

Initial test-account registration was rate limited, so the existing synthetic session was restored normally. Real-model checks in **both** environments were blocked by Bailian `403 insufficient_quota` on `qwen3.7-plus`, business code `AI_BAILIAN_QUOTA_UNKNOWN`; the Production request failed upstream after 1096 ms. Production verification confirmed the exact original wording was retained and the retry/original-save UI was shown. This is a separately reported external provider blocker, not a passing model acceptance. No model switch, billing/configuration change or rate-limit bypass was attempted. The test-session reuse and release-evidence follow-up changes only test tools/documentation, so it does not redeploy an unchanged application.

No destructive historical record migration is included. Existing saved originals remain intact; the explicit precision correction also applies when reading older records.
