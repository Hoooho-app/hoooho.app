# Hoooho nickname authentication and session persistence

## Account identity

New users register and sign in with a nickname and a 6–64 character password.
Nickname input is Unicode NFKC-normalized, trimmed, case-folded for its stored
lookup key, limited to 1–20 letters or numbers, and unique across formal
accounts. The database continues to keep a random internal account identifier
for ownership links; it is not a user-facing credential. Passwords are stored
only as bcrypt cost-12 hashes with independent salts.

Existing email accounts remain the same account. Accounts without a nickname
must choose a unique nickname after their next email login. An existing valid
guest browser session can register in place, preserving its account identifier,
current member, family members, health profile, and health records. There is no
public guest-creation or recovery-code endpoint.

## Sessions and abuse controls

Browser sessions use opaque 256-bit tokens. Only SHA-256 token hashes are stored
in `browser-sessions.json`. The cookie is HttpOnly, SameSite=Lax, Path=/, valid
for 180 days, Secure in deployed environments, and uses the `__Host-` prefix.
Registration and login rotate the current browser session. Password changes
revoke older sessions.

The app restores the server session before rendering protected routes or the
login page. A network or server failure produces a retry state and is not
treated as logout. `lastLoginNickname` is the only login hint kept in local
storage; passwords and session credentials are never stored there.

Password login failures use a persistent hashed-key attempt store. Public
failures never reveal whether a nickname exists. Authentication writes require
same-origin JSON requests and are never cached.

## Migration and rollback

The migration is additive: `nicknameKey` is added when a nickname is registered
or updated. Reads also derive the normalized key from legacy nicknames, allowing
safe rollout before every record is backfilled. Production must keep
`DATA_DIRECTORY` on the Railway persistent volume and run one application
replica. Rollback retains the volume and redeploys the previous commit; older
code ignores the additive field.
