# Hoooho account and session persistence

## Account identity

New users register with a display nickname and a 6–64 character password. The
server assigns an eight-character, non-sequential `Hoooho ID`; its alphabet omits
ambiguous characters. Nicknames are not unique login identifiers. Passwords are
stored only as bcrypt cost-12 hashes with independent salts.

Existing email or phone accounts receive a Hoooho ID lazily on their next login
or session restore. The field is added to the same user record, so this does not
create a duplicate account. Existing valid guest sessions can register in place:
the account ID and every health-data ownership link remain unchanged. No public
endpoint creates a new guest account, and invalid sessions are never matched by
name, IP address, user agent, or another heuristic.

## Sessions and abuse controls

Browser sessions use opaque 256-bit tokens. Only SHA-256 token hashes are stored
in `browser-sessions.json`. The Cookie is HttpOnly, SameSite=Lax, Path=/, valid for
180 days, Secure in deployed environments, and uses the production `__Host-`
prefix. Login and registration rotate the current browser session. Password
changes revoke every older browser session for that account.

Password login failures use a persistent, hashed-key attempt store. Five
consecutive failures begin a progressive temporary lock, capped at 15 minutes.
Public failures never reveal whether the Hoooho ID exists. Authentication writes
require same-origin JSON requests and are never cached.

## Migration, storage, and rollback

The migration is additive: optional fields are added to `users.json`, and the
only new data file is `password-login-attempts.json`. Historical guest health data
is not deleted or reassigned. Registration and in-place upgrade use the existing
durable account transaction journal, so a failed user/session write rolls back.

Production must keep `DATA_DIRECTORY` on the Railway persistent volume and run a
single application replica. The JSON stores are not safe for multiple processes
sharing one volume; horizontal scaling requires migration to a transactional
database. Rollback consists of stopping writes, confirming no pending account
transaction, retaining the volume and all additive fields, then deploying the
previous application commit. Older code ignores the new optional user fields.

## Verification

- `npm run test:auth`: ID generation, bcrypt storage, login throttling, migration,
  password changes, session revocation, idempotency, and guest upgrade rollback.
- `npm run test:server`, `npm run test:client`, `npm run typecheck`, `npm run build`.
- `npm run test:e2e:auth`: registration, durable session, remembered ID, ID login,
  email fallback, and 375/390/430 pixel layout checks.
- `npm run test:e2e:account-flow`: drawer, account sheet, and security pages.
