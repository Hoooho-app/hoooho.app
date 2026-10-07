# Daily automatic record proposals

Scope: a settings section in existing feeding/food/supplement, sleep, bowel,
topical and medication forms. No routine plan rows are restored. Existing routine
templates remain plan-only and accessible from the original settings sheet.

## Consent and ownership

- Start OFF with one editable suggestion, not a pre-created set of rules.
- Additional slots are blank and explicitly added. Names, clocks, quantities and
  type-specific fields are independent; stable rule/slot IDs survive renaming.
- Settings belong to an authenticated account and member. The established guest
  merge transfers rule ownership; proposals reconcile against canonical member
  and rule ownership without changing instance IDs. Verified account deletion
  removes owned rules, operations, proposals and cursors, not another account's data.
- Current actual record plus rule updates use the existing recoverable JSON
  account transaction. A failed duplicate decision/save does not activate settings.
- Drafts are session-scoped by account/member/type/revision. Failed saves retain
  inputs. Existing multi-slot rules are restored intact, not replaced by defaults.

## Scheduling and versioning

- `server/app.mjs` runs an immediate startup scan and a 30-second server scan.
  No browser timer creates proposals. Closed pages and server restarts are safe.
- A new rule or content/time change starts the next local day in its saved IANA
  timezone. Actual backfill does not backdate rules. Pause/removal stops future
  proposals immediately; resume starts tomorrow, without filling paused periods.
- Immutable versions determine what was effective at the scheduled instant.
  Unchanged settings do not create another version. Historical instances remain
  unchanged when rules are edited.
- SQLite unique `(account_id, member_id, rule_id, slot_id, day)` is the database
  authority for proposal creation, including competing scheduler processes.
  Revision is NOT part of the unique identity. Completed-day cursors bound scans.
- Nonexistent daylight-saving wall clocks are skipped, not shifted to another
  clock. The first occurrence of an ambiguous clock is resolved deterministically.
- Fixed medication requires an explicit dose/unit and end date or explicit
  “until closed.” As-needed medication cannot generate daily proposals.

## Proposal versus actual fact

`routine-instances.sqlite` is a separate proposal store. Unconfirmed/skipped items
never enter HealthEvent/HealthEventRecord, so existing summaries, statistics,
exports and AI fact inputs cannot treat them as actual observations.

Due instances display one compact row, “自动记录 · 未确认.” Individual confirmation
can adjust real occurrence/type fields for this instance only. Batch review starts
with NOTHING selected and confirms only checked due instances. Success replaces
the pending row with the one actual record; original detail/save/end workflows
continue to operate. Source identity and the rule clock remain available in detail.

Confirmation claims are database compare-and-swap operations. Actual writes use
the existing persistent QuickRecord idempotency key `daily_<instance ID>` and JSON
account transaction. A crash after actual commit but before linking is recoverable
without another fact. Explicit association from a manual form is also supported;
category/time proximity never silently combines independent actual records.
Link failures return `DAILY_LINK_PENDING`, stating that actual data was saved and
retry will not duplicate it. Concurrent confirmation reports a retryable conflict.

Snapshots whitelist only intended recurring fields. They never copy symptoms,
feeding/bowel observations, photos, transcripts, nurse notes or reminders.
Sleep confirmation defaults to genuinely ongoing sleep WITHOUT a wake timestamp
or calculated duration. A real wake time must be explicitly supplied or captured
through the existing end-sleep action; a usual clock never ends actual sleep.

## API and deployment

- `GET/PATCH /api/routines/:memberId/daily`: latest settings / validated update.
- `GET /api/routines/:memberId/daily/instances?day=YYYY-MM-DD`: owned proposals.
- `POST /api/routines/:memberId/daily/instances/:id`: confirm/skip due instance.
- `GET /api/routines/:memberId/daily/source/:recordId`: owned confirmation provenance.
- Existing `POST /api/quick-records` accepts optional `dailySettings` and
  `automaticInstanceId`. No AI provider, model, authentication or original upload
  service is replaced.
- The Vite development API exposes the same routes, atomic saves and server-side
  scheduler as the deployed server. Development confirmation also rejects future
  proposal times; fixture generation does not bypass that check.

Node >=22.13 is required for built-in `node:sqlite`; declared in package/lockfile.
The SQLite DB and WAL live in the existing persistent DATA_DIRECTORY. Backups must
include this store, not just JSON files (use a consistent SQLite backup or quiesce
the service before copying DB/WAL). Deployments retain the existing single process
owning each JSON volume; competing scheduler processes are safe, but concurrent
multi-process writes to ALL existing JSON facts are not a newly supported topology.

Checks: `npm run test:daily-records`, `npm run test:e2e:daily-records`, existing
client/server tests, typecheck/build, entry and single-occurrence regression suites.
Mobile tests use isolated real local APIs at 375/390/430, never production clock
override endpoints. Deployed acceptance checks next-day activation and no immediate
facts; a same-day production visit alone cannot prove tomorrow's scheduled tick.
