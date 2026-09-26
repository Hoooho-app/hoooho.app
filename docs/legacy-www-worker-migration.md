# Retire the legacy www service worker

## Incident evidence (2026-09-17)

The user supplied an old phone-code login screenshot and confirmed its full URL
as `https://www.hoooho.com/login`. The canonical application is on
`https://hoooho.com`. Live www page requests redirect to the canonical host, but
`https://www.hoooho.com/sw.js` also returns a Cloudflare 301. A service worker
script update rejects redirects; an already installed cache-first navigation
worker can keep serving its old UI without reaching the page redirect.

The browser regression reproduces that failure before applying the replacement
worker, then verifies recovery in Chromium and WebKit. This explains a concrete
legacy-entry failure, not yet every physical Safari cookie-loss report.

## Release dependency

Cloudflare's www redirect must exclude exactly `/sw.js` (including its query
variants). Let that path reach this application's www origin, or serve the
identical retirement script directly at the edge. It must return JavaScript
**200**, `Cache-Control: no-store, max-age=0`, and `Service-Worker-Allowed: /`;
no redirect, login requirement, challenge, or HTML. All other www paths retain
the existing canonical redirect. Do not change DNS, TLS or Cookie Domain merely
to share sessions across these two origins.

Deploy the application handler before adjusting the edge rule. Check the public
www script response after the edge change, not only the Railway origin response.
If edge access is unavailable, this fix is blocked even if the app is deployed.

## Safety and verification

The worker replaces the obsolete navigation interceptor, unregisters itself,
and reloads only www `/` and `/login` clients through the existing network
redirect. It does not interrupt forms on other paths; their next navigation goes
through the network. No cookies, localStorage, IndexedDB, caches, guest records,
or account data are deleted, copied or used to establish identity. Existing
canonical sessions remain host-only, HttpOnly, server-validated sessions.

Run `node --test server/domain-routing.test.mjs server/legacy-domain-service-worker.test.mjs`
and `node --test tests/legacy-domain/retirement.test.mjs`.
The browser fixture uses non-authentication sentinel data; it is not proof of
production login persistence. Physical iPhone Safari must still verify both old
www entry migration and canonical login recovery after process termination.

Retain this script URL as a tombstone for dormant old clients. Reintroducing a
redirect at `/sw.js` would reintroduce the migration trap. No database migration,
password changes, or forced logout is needed.
