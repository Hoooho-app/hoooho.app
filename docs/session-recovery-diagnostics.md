# Browser session recovery evidence

The 2026-09-17 01:57 Asia/Shanghai Safari retest failed after PR #183.
Production HTTP logs show a successful login/restore at 01:55:59, an anonymous
restore response at 01:56:58, and another successful login at 01:57:02, all on
the same deployment. Those logs do not contain request cookies or session lookup
results. They cannot distinguish browser persistence loss from server rejection.

`[Hoooho session]` logs now cover login, register, restore and logout. They record
only per-request IDs, endpoint, status, duration, iOS/other, client build,
expected-cookie presence, local nickname presence and remember preference enums,
restore outcome and emitted persistence mode. They never include cookies, tokens,
passwords, account IDs, nicknames, IPs or full user agents. Client-supplied values
are allowlisted and are diagnostic hints only; they never authorize a request.

Restore outcomes distinguish missing/malformed cookie, missing/revoked/expired
session, missing/merged account, successful validation and rejected renewal.
They are also returned in `X-Hoooho-Session-Outcome`; response bodies and auth
decisions remain compatible. Storage errors remain errors, not missing sessions.

To investigate a real device report, inspect the same time window's successful
login, immediate restore, and first restore after browser termination. Check:

- persistence `persistent` followed by `valid` confirms the browser accepted the
  cookie on that request, but does not prove it was flushed to disk;
- `missing-cookie` after restart isolates missing credentials before lookup;
- `session-not-found`, `session-revoked`, or `session-expired` isolates server
  validation with a supplied cookie;
- nickname `present` becoming `absent`, with a matching client build, identifies
  a second missing browser storage item; it is not proof of private mode;
- `unknown` client build/storage means an older client or non-app request;
- 5xx is temporary and must not be interpreted as confirmed logout.

This instrumentation does not itself repair Safari persistence or constitute
physical-device acceptance. Do not report the original fault fixed on this basis.
