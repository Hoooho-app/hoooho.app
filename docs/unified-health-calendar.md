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
