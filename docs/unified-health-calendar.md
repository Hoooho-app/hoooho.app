# Unified health calendar

`/health-events` hosts the existing day timeline and the monthly projection.
`/health-calendar` replaces itself with the monthly mode; search/new/detail
subroutes remain intact. Home entry labels and business APIs are unchanged.

Navigation query: `view=day|month`, valid local `day=YYYY-MM-DD`,
`month=YYYY-MM`, existing `category`, `sort=asc|desc`. Business parameters are
preserved. Invalid/future dates normalize to the existing allowed range.
An explicit empty `category` means all types, never a stale restored filter.
Restored navigation, scroll and cache are scoped to account and member.
Search returns the scoped view/filter/date/sort/scroll state. Switching members
does not consume another member's query or stale search return state.

Both projections use `useJournal` saved facts and shared `journalOccurrenceAt`.
Completed sleep/feeding appear once on their end date. Unknown-time facts are
not assigned an invented calendar day; their data/search remain available.
Unconfirmed daily instances stay in the day workflow, not monthly fact counts.
Routine configuration does not become a calendar fact.

One shared `RecordEntryActions` and existing `JournalRecorder` preserve distinct
feeding/supplement kinds, photos, draft/retry/duplicate handling and real saves.
Record-specific daily-management sheets remain available. The legacy routine
setup entry is removed from the calendar page.
No schema, API, authentication, AI configuration or production data migration.

Regression: `npm run test:e2e:health-calendar`; the former
`tests/health-calendar` config delegates to the unified suite. The removed
standalone plus/modal assertions have been replaced with the approved shared
entry and real local API save/edit/delete assertions. Also run client/server,
record-entry, journal-single-occurrence and daily-records suites.

Writing acceptance tests use isolated temporary local JSON stores and controlled
test accounts. Deployment acceptance keeps health facts read-only and reports
fixture creation/cleanup, existing session-member synchronization and production
Cloudflare edge telemetry separately. No other application write is permitted.
Screenshots: `outputs/unified-health-calendar`, including 320×568, 375×667,
390×844, 430×932 and desktop, four/five/six-week months, long/dense previews,
direct view switching and merged drawer. Physical iPhone Safari still needs human acceptance.

The older time-view voice/interim-SpeechRecognition and thumbnail retry tests
do not match the current formal branch's voice/photo flow; its save-error locator
also matches two alerts. These three failures were reproduced on unmodified
`34624b82` and were not hidden or used to modify shared AI/upload behavior.

## Calendar toolbar correction

The type picker keeps its native selection behavior with no visible arrow.
The view button switches directly between day and month, including touch and
keyboard activation. Only day view exposes sorting; its order and category
remain selected on return. The inactive timeline stays mounted but is hidden
entirely, so it cannot consume month-grid space. The toolbar gear and legacy
routine setup entry are removed from this page; existing automatic-record
confirmation and record-specific daily settings remain available.

## Five presentation groups and day sheet

The toolbar order is date, direct day/month toggle, native arrowless type
selection, day-only sort in a fixed reserved slot. The only filter options are
All, feeding, daily, medication, symptom and medical materials. The pure
`presentationGroup` maps saved records without changing category, diet kind,
source, APIs or schemas. Legacy known category links normalize to their group;
unknown categories return to All with a notice. Unknown records remain neutral.
Unconfirmed materials and future occurrences are not saved-fact counts; explicit
unknown occurrence dates are not replaced with upload or creation dates.

Day cards keep their previous white single-line dimensions and typography.
Only the 16px icon/group accent changes. The shared deterministic presenter
retains qualifiers, exact source values and original detail; it never invents
drug abbreviations, diagnoses, zero durations or durations from routine plans.
Month previews use the same group palette. Weekend/rest tones remain muted;
makeup workdays and the existing today marker retain their semantics.

Month date or +N opens a locally selected day sheet without changing view or
URL. It shows all filtered facts by occurrence, creation time and stable ID,
descending independently of the remembered day sort. Existing record details
and attachment access are reused; returning restores sheet scroll and focus,
then the original month cell. The sheet is labelled, focus-trapped, Escape-
dismissible and isolates the background. It never saves by opening.

Both views share the footer: feeding/diet, daily, medication, medical materials,
then the green symptom button. Feeding has three peer tabs (milk, food,
supplements), retaining original persisted kinds and separate drafts/time.
Medical materials reuses the visit flow. The existing front-desk smart-record
route and shared AI/upload services are not removed or rebuilt.

Additional regression: `tests/unified-health-calendar/five-groups.spec.ts`
covers mixed facts, qualifiers, doses, cross-midnight counts, stable ties,
sheet focus/return/no writes, peer-tab drafts and constrained viewports.
Before/after same-fixture screenshots are under `outputs/calendar-five-groups`
and `outputs/unified-health-calendar`. Physical iPhone Safari and the right
preview device state are not claimed by the independent browser tests.
The six older global routine-setup UI cases still target the removed toolbar
entry (removed in `1124bca0`); the scoped occurrence run covers the six still
applicable sleep/feeding/meal cases instead. They are not silently skipped or
reported as a fully passing legacy suite. Daily-management tests use the existing
confirmed-record origin entry and retain save, provenance and batch assertions.
