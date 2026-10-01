# Hoooho v3: case continuity implementation and acceptance boundary

This is an incremental candidate based on `ed0d7dcb63664eefc71536a19b2c32fa2225e07d`.
It is not a claim that the prototype, OCR, live ASR, physical iOS camera, push
delivery, or Production release has passed. The supplied v3 prompt is authoritative;
the separately named `Hoooho_Revision_Spec_v3.txt` was absent. The supplied HTML
revision plan and two synthetic flow images were available.

## Preserved boundaries

- NurseStation only imports/inserts `FollowUpHome` between the existing profile
  and six entries. Profile, nurse media, growth/blood editing, header, sidebar,
  install action and six-card order/geometry/assets/colors are unchanged.
- Existing HealthEvent / HealthEventRecord / attachments / organizations / AI
  business drafts / visit sheets remain the source of truth. No separate medical
  database, destructive migration, production-data rewrite, or new diagnostic rule.
- Existing medication and desensitization execution/undo/archive/reminder rules are
  untouched. An observation task is not a medication/desensitization task.
- `TopicalRecordFlow` uses the current RecordForm shell, photo draft service,
  body locator, occurrence time and journal save callback. Only the daily activity
  entry becomes `care.topical`; historical `activity.outdoorActivity` stays editable.

## Naming / deletion audit (R01)

| Actual identifier | Treatment |
| --- | --- |
| `/food-allergy-status-index` | Compatible retired explanation and usable record/profile links; no numeric output. |
| `HealthInsights`, `health-insights`, `abc` | Removed ABC projection and consumer; retained source-backed intake/temporal facts without causal or ranking claims. |
| `ABC_A`, `ABC_B`, `ABC_C` | Removed new extraction schema/producer. Historical field labels remain for reading original confirmed records, not calculation. |
| `DesensitizationTestService`, `desensitization-tests`, `desensitizationSummary` | Kept independent factual observation, history, plans and legitimate reminder behavior. |
| Locator `rank` / `ranked` | Anatomical hit-target layout ordering, not medical cause ranking; preserved. |
| Adversarial runner `riskConclusion` | Engineering test report status, not a product health output; preserved. |
| Added emergency/hotspot standalone flow | None in this canonical baseline; not recreated. |

No near-name bulk deletion. Previous dedicated index display/calculation had already
been removed in main; this change closes the legacy link and remaining ABC producers.

## Additive contract

`server/events/case-continuity-service.mjs` adds only optional metadata:

- HealthEvent: `caseTracking`, `caseArchivedAt`, `observationTasks`.
- HealthEventRecord: `caseContext` (request id, confirmed source identity, unknown
  time, supplement, locator labels, attachment ids, existing AI draft reference,
  observation task/result, source revisions).
- AI business draft: `targetEventId`, `sourceIdentity`, `deferRecognition` request.
- Visit sheet: explicit `selection` (event ids, optional from/to, background choice)
  and `focus.caseEventId`. Scope is retained across photo/focus/question edits and
  used consistently for fingerprint/read/export validation.
- Journal: optional `topical`, kind `skincare / external_medication / other`;
  historical `care` remains readable. Name or packaging is required only on creation.

All HTTP paths authenticate and recheck account/member ownership. New POSTs use
existing account transactions, stable request ids and original attachment storage.
Formal record save is distinct from draft recognition. `deferRecognition` stores
originals in the existing AI draft repository before any upstream call. The existing
review composer restores that exact draft and requires confirmation before saving.
Pending/external AI sources cannot create medical facts/profile diagnoses. Doctor
observation references require a confirmed doctor-message record, matching quote
and explicit page; otherwise an arrangement is parent-created.

Archive is not recovery. It preserves records and pauses this event's active
observations; restore does not resume them. Deadlines affect only that observation.
Missing feedback, explicitly not observed, improved, unchanged and worse are
distinct. Notification defaults off; enabling fails honestly because the delivery
channel is not verified. No background/lock-screen promise.

Device draft storage contains only unsaved input, never a parallel clinical store.
Keys include account, member, event and task. Guest local input follows the existing
server merge only after the authenticated server confirms ownership of that exact
member ID, and only when exactly one same-context guest draft exists. It does not
import all browser guests or overwrite an existing formal draft. Original formal
case/AI-draft merging uses the unchanged AccountDataService.

## Routes / components reused

- `/smart-record`, `/cases`, `/cases/compare`, `/cases/:eventId/materials`,
  `/cases/:eventId/observation`: context adapters to existing event/record services.
- `/health-events/:eventId`: unchanged timeline plus explicit continuation/material/
  observation/archive actions; sorting remains occurredAt, createdAt, id.
- `/visit-summary/:eventId`: same VisitSummary reader, chapter layout, nurse identity,
  source editor, photo picker, question editor, report service and offline export.
- AIBusinessComposer: existing recognition/review component remains for structured
  confirmation/profile input; normal smart entry uses the single raw-first workspace.
- `useSymptomVoice`: existing browser SpeechRecognition partial results with segment
  guards plus MediaRecorder originals. This is not a new server streaming-ASR API.
  Unsupported/failed recognition reports the limitation and keeps keyboard/photos.

## R01–R16 status at candidate handoff

“Implemented” below means source and local evidence, not Production acceptance.

| Requirement | Implementation / evidence | Status boundary |
| --- | --- | --- |
| R01 | contract/insights/HealthInsights/router; absence assertions and retired deep-link E2E | Implemented. |
| R02 | additive service metadata, unknown time, original attachments, unchanged outdoor branch; transaction/ownership tests | Implemented; no migration executed. |
| R03 | CaseCards/useCases; 0/1/3/4, real case count, max3, archives, loading/error tests | Implemented. |
| R04 | CaseCaptureWorkspace; one header save, optional locator, occurrence time, ownership confirmation, refresh | Implemented. |
| R05 | useSymptomVoice; partial/release/cancel/late callback simulation, real audio capture code | BLOCKED: real streaming service/device acceptance not run. Browser simulation is not live ASR proof. |
| R06 | system capture/file inputs and existing draft defer/recognize/review chain; originals before recognition | BLOCKED: physical iOS camera and Staging real OCR acceptance required. |
| R07 | original detail/actions/ComparisonRecords; archive/restore and stable ordering | Implemented; compare is fact-only. |
| R08 | existing VisitSummary + ReportScopeSheet; explicit scope persisted and read/export fingerprint tested | Implemented; no second report or report rearrangement. |
| R09 | existing report chapters, raw source identity, question edit, complete-copy and offline original embedding | Implemented; mobile/desktop report regression and scoped export tests. |
| R10 | MaterialReturnPage, existing review composer; three labeled synthetic originals/manual confirmation and server source guards | BLOCKED for real OCR of all three classes. Synthetic/manual acceptance is distinct. |
| R11 | bounded observations, source quotes, station feedback, pause/end/extend/archive, no fake normal | Station workflow implemented; system notification channel BLOCKED/unverified and not enabled. |
| R12 | TopicalRecordFlow and additive journal mapping; current shell, locator/photos/time, historical outdoor preserved | Implemented; no oral-medication/reminder synthesis or duplicate medication task. |
| R13 | member/token-keyed queries, callback aborts, guest/formal metadata merge and scoped local draft recovery | Implemented locally; physical-device/full live login transfer still not verified. |
| R14 | empty guard, raw-first/idempotent/transaction tests, draft persistence, original failure fallback, old report protected | Implemented; specific failure injections are simulated, not live outages. |
| R15 | background Chrome 320/375/390/430/1280 tests; six equal cards, report exports; visible preview untouched | Browser verification; physical iOS/real microphone acceptance NOT_EXECUTED. |
| R16 | opt-in Staging verifier, isolated candidate branch, deployment gate | BLOCKED until actual Staging acceptance and main/Production release pass. |

## Reproducible local checks

```powershell
npm run test:client
npm run test:server
node --test server/ai/business/*.test.mjs server/visit-sheets/*.test.mjs server/events/case-continuity-service.test.mjs
npm run test:journal
npm run evaluate:parser
npm run build
npx playwright test --config tests/case-continuity/playwright.config.ts
npx playwright test --config tests/visit-sheet/playwright.config.ts --project=mobile-320 --project=desktop
npx playwright test --config tests/ai-business/playwright.config.ts
npx playwright test --config tests/nurse-station/playwright.config.ts
npx playwright test --config tests/record-entry/playwright.config.ts
git -c core.whitespace=cr-at-eol diff --check
```

The original visit-sheet tests were reproduced on detached main before adjustment.
Their dated plan fixture, obsolete copy/photo-order assertions and question-label
accessibility were corrected without deleting tests or rolling back the approved
report layout. A genuine complete-copy omission and new scoped-fingerprint mismatch
were repaired. Nurse tests now use their own listener rather than silently reusing
an older server. AI test substitutes exist only in the isolated test server.

Screenshots/artifacts are ignored under `outputs/continuity-v3` and `test-results`.
They are rendered runtime pages using explicitly synthetic people/materials, not
product backgrounds or real patient data. ASR-simulation filenames say synthetic.

## Release gate

Canonical repository: `Hoooho-app/hoooho.app`, main. Railway project
`d8855fe3-c785-4b8c-825b-bdb10a941850`, service
`aa308ba0-d7da-4771-9c94-ccdcd110f636`.

Staging: `https://hooohoapp-staging.up.railway.app`; Production: `https://hoooho.com`.
Stage the isolated candidate explicitly before main integration, because main
auto-deployment otherwise starts both environments. No `--no-gitignore` upload.

Staging configuration presence was checked without outputting secret values and
has no AI key. No Production secret was copied. Credential setup/reuse needs direct
human authorization. Keyboard/photo originals remain available; lack of OCR must
not be presented as successful extraction.

The opt-in `RUN_HOOOHO_CONTINUITY_STAGING=1 node scripts/verify-case-continuity-staging.mjs`
uses real HTTPS APIs, one dedicated synthetic account/member, actual persistence
and screenshots, one bounded provider attempt and no test doubles. It cleans only
its own draft/member through authenticated APIs; it does not bypass identity deletion
to remove the isolated account. Results/cleanup are in ignored verification.json.
It does not prove physical camera, real partial ASR or background push delivery.

Do not merge/release Production while the required Staging AI/device acceptance
gate is blocked. Final delivery must give actual commit/deployment/health evidence,
not label deployment N/A or use an HTTP200 as full functional acceptance.
