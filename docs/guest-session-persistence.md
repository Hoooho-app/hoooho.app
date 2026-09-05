# Persistent guest sessions

## Scope and recovery

Guest accounts share `users.json` and the existing `accountId` ownership contract.
The browser first obtains an unbound, backend-generated HttpOnly session cookie.
An explicit guest action atomically binds that session to a new guest user. This
allows concurrent POSTs and retries after lost responses to reuse the same user.
No network error triggers guest creation. Browser startup blocks routing until
session, owned members and server archives have loaded; failures offer retry.

The opaque 256-bit cookie has Path=/, SameSite=Lax, 180-day Max-Age and Secure in
deployed environments. Only its SHA-256 hash is stored in `browser-sessions.json`.
Production uses the `__Host-` cookie prefix to prevent Domain/path shadowing.
Short-lived API bearer tokens remain in memory. The previous sessionStorage token
is accepted for one-way legacy migration only; new browser tokens cannot mint a
replacement cookie after logout. Authentication endpoints are no-store and
cookie operations validate Origin/Fetch Metadata and JSON content types.

## Data and merge

Existing member, event, record and attachment repositories remain authoritative.
Previously local-only editable archives now use `health-profile-sections.json`,
scoped by account and member, with revision conflict detection. Legacy browser
archives are imported only for server-confirmed owned members, only when no
server archive exists. Original local copies are retained, never deleted.
Current-member selection is saved on the user and ownership-checked; the local
selection remains a non-sensitive recovery hint and is validated on startup.

After verified formal login, the server preserves IDs, records, attachments and
existing formal-account data, changing only guest ownership. The merge journal
rejects a second destination and makes repeated merges to the same account
idempotent. Guest sessions are revoked only in the successful transaction.
Health archive and feedback metadata are included. Binary file paths are unchanged.

The existing single-process JSON repository uses a shared read/write barrier and
a durable rollback journal (`pending-account-transaction.json`). Merge writes are
staged, journaled, then committed; failures roll back. Startup recovers an
interrupted transaction before exposing data. Account locks prevent an already
authenticated request from writing under the old owner after a merge. Do not run
multiple application processes against the same JSON volume; scaling requires a
transactional database rather than sharing this directory across replicas.

## Additive migration and rollback

There is no table rebuild, data purge or SQL migration. New files and optional
user fields are additive. Existing guest records without a persisted user are
adopted only with a valid legacy signed token. A local guest ID alone is not proof
of ownership. Unrecoverable legacy records must be preserved for an authorized
support recovery process; never guess ownership or delete them.

Before rolling application code back, stop writes and ensure the pending
transaction journal is settled. Keep all new data files and backups. Older code
does not restore the new browser cookie or read server archive files, so a code
rollback alone is not a functional data-recovery strategy.

## Verification

- `npm run test:guest`: session hashing/expiry, concurrency, merge isolation,
  all-collection preservation, rollback, crash recovery, archive conflicts.
- `npm run test:server`: runs guest tests as a mandatory pretest plus existing tests.
- `npm run test:client`, `npm run typecheck`, `npm run build`.
- `npm run test:e2e:guest`: real Chromium persistent-profile restart, internal
  routes, append persistence, failed restoration/retry and browser isolation.
- Existing child-profile, quick-record and account-flow browser tests remain gates.

Chromium device/WeChat User-Agent emulation is not a real iOS Safari or WeChat
test. Incognito session termination, explicit cookie clearing and changing devices
cannot preserve an anonymous session; verified login remains the recovery route.
