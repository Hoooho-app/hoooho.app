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

The release uses the normal `main → Staging verification → Production verification` chain. Run `tests/dialogue/smart-record-refinement-live.mjs` against each verified deployment with its expected commit. It creates only a synthetic account/member, uses the configured real model, verifies one incident/clock/evidence plus the changed calendar controls, and removes the synthetic member afterward. Deployment identities and live results are recorded in the pull request.

No destructive historical record migration is included. Existing saved originals remain intact; the explicit precision correction also applies when reading older records.
