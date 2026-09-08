# Guest recovery code

An optional manual recovery channel; this does not fix Safari storage loss or claim automatic recovery. Existing guests must first regain their valid session to generate a code in Account and security. No account may be claimed by diagnostic ID, name, or device fingerprint.

The browser uses Web Crypto to generate 256 random bits, shown as 64 hexadecimal characters. The user saves the replacement code outside browser storage before activation. The code remains in component memory only; no URL, analytics, diagnostics or persisted application state contains it. Treat the code as an account recovery secret: XSS while displaying or entering it can steal it. This is not an XSS-resistant credential.

POST /api/auth/guest-recovery accepts issue, revoke or restore, using existing same-origin JSON/CSRF checks. Issuance/revocation requires an active guest Cookie. Recovery requires no active account, a valid unexpired code and a distinct replacement code. Store only SHA-256 hashes, account IDs and 180-day expiry in /data/guest-recovery-codes.json. Existing single-process volume/transaction constraints apply. No destructive migration is needed.

Code consumption, replacement and new HttpOnly session creation share the account transaction. Recovery revokes earlier browser sessions, retains account/member/event IDs and does not copy records. Concurrent replay cannot succeed twice. Merged/formal accounts cannot recover using guest codes. The login flow subsequently confirms the new Cookie through session restoration.

If the response is lost, the replacement is already saved by the user; retain both codes and try the replacement first. Do not automatically retry creation or silently create a new guest. The optional code may be revoked or replaced in Account and security. A browser that loses all credentials and has no previously saved recovery code cannot be safely linked to an old guest by this feature.
